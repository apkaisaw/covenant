/// Covenant: Self-executing diplomatic treaties for EVE Frontier.
///
/// Two alliances sign a Non-Aggression Pact (NAP), each staking SUI as a deposit.
/// If a KillMail shows a member of one alliance killed a member of the other,
/// an oracle reports the violation and the violator's deposit compensates the victim.
///
/// Architecture: off-chain indexer monitors KillmailCreatedEvent, matches
/// attacker/victim against treaty member lists, then submits report_violation on-chain.
#[allow(lint(self_transfer))]
module covenant::covenant;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::clock::Clock;
use sui::event;
use sui::sui::SUI;
use sui::table::{Self, Table};
use std::string::{String, utf8};

// === Constants ===

// Treaty types
const TREATY_NAP: u8 = 0;        // Non-Aggression Pact
const TREATY_CEASEFIRE: u8 = 1;   // Ceasefire (time-limited NAP)

// Treaty status
const STATUS_PENDING: u8 = 0;     // Waiting for counterparty to sign
const STATUS_ACTIVE: u8 = 1;      // Both parties signed, treaty in force
const STATUS_VIOLATED: u8 = 2;    // Breach detected, deposit forfeited
const STATUS_COMPLETED: u8 = 3;   // Expired normally, deposits returned
const STATUS_CANCELLED: u8 = 4;   // Cancelled before activation

// Minimum deposit: 0.1 SUI (100_000_000 MIST)
const MIN_DEPOSIT: u64 = 100_000_000;

// Graduated penalty tiers (percentage of deposit forfeited per violation)
// 1st violation: 20%, 2nd: 40%, 3rd+: 100% (treaty terminated)
const PENALTY_TIER_1_PCT: u64 = 20;
const PENALTY_TIER_2_PCT: u64 = 40;
const PENALTY_TIER_3_PCT: u64 = 100;
const MAX_VIOLATIONS_BEFORE_TERMINATION: u64 = 3;

// === Errors ===

/// Sender is not the Alliance B leader
const ENotPartyB: u64 = 1;
/// Sender is neither Alliance A nor Alliance B leader
const ENotParty: u64 = 2;
/// Deposit coin value is less than the required amount
const EInsufficientDeposit: u64 = 3;
/// Treaty is not in PENDING status
const ETreatyNotPending: u64 = 4;
/// Treaty is not in ACTIVE status
const ETreatyNotActive: u64 = 5;
/// Treaty has already expired
const ETreatyExpired: u64 = 6;
/// Treaty has not expired yet (cannot complete early)
const ETreatyNotExpired: u64 = 7;
/// Attacker character ID is not in either alliance's member list
const EAttackerNotMember: u64 = 9;
/// Victim character ID is not in either alliance's member list
const EVictimNotMember: u64 = 10;
/// Attacker and victim belong to the same alliance (not a treaty violation)
const ESameAlliance: u64 = 11;
/// Treaty type must be NAP (0) or CEASEFIRE (1)
const EInvalidTreatyType: u64 = 12;
/// Ceasefire treaties require a non-zero duration
const EZeroDuration: u64 = 13;
/// Deposit required must be at least MIN_DEPOSIT (0.1 SUI)
const EDepositTooLow: u64 = 14;

// === Structs ===

/// Capability granted to the oracle service that monitors KillMail events
/// and reports treaty violations on-chain.
public struct OracleCap has key, store {
    id: UID,
}

/// A diplomatic treaty between two alliances.
/// Shared object so both parties and the oracle can interact with it.
public struct Treaty has key {
    id: UID,
    // Treaty metadata
    treaty_type: u8,
    description: String,
    // Parties
    alliance_a_leader: address,
    alliance_b_leader: address,
    alliance_a_name: String,
    alliance_b_name: String,
    // Member lists: character_id -> bool (for O(1) lookup)
    alliance_a_members: Table<u64, bool>,
    alliance_b_members: Table<u64, bool>,
    alliance_a_member_count: u64,
    alliance_b_member_count: u64,
    // Deposits
    deposit_required: u64,
    alliance_a_deposit: Balance<SUI>,
    alliance_b_deposit: Balance<SUI>,
    // Lifecycle
    status: u8,
    created_at_ms: u64,
    effective_at_ms: u64,
    expires_at_ms: u64,
    // Violation tracking
    violation_count: u64,
}

/// Immutable record of a treaty violation, transferred to the victim alliance leader.
public struct ViolationRecord has key, store {
    id: UID,
    treaty_id: ID,
    attacker_character_id: u64,
    victim_character_id: u64,
    killmail_id: u64,
    timestamp_ms: u64,
    compensation: u64,
}

// === Events ===

public struct TreatyCreated has copy, drop {
    treaty_id: ID,
    alliance_a_leader: address,
    alliance_b_leader: address,
    treaty_type: u8,
    deposit_required: u64,
    expires_at_ms: u64,
}

public struct TreatySigned has copy, drop {
    treaty_id: ID,
    alliance_b_leader: address,
    effective_at_ms: u64,
}

public struct TreatyViolated has copy, drop {
    treaty_id: ID,
    attacker_character_id: u64,
    victim_character_id: u64,
    killmail_id: u64,
    violating_alliance: address,
    compensation: u64,
}

public struct TreatyCompleted has copy, drop {
    treaty_id: ID,
}

public struct TreatyCancelled has copy, drop {
    treaty_id: ID,
    cancelled_by: address,
}

// === Init ===

/// Module initializer: creates the OracleCap and transfers it to the deployer.
fun init(ctx: &mut TxContext) {
    transfer::transfer(
        OracleCap { id: object::new(ctx) },
        ctx.sender(),
    );
}

// === Public Functions ===

/// Alliance A leader creates a treaty proposal and deposits SUI.
/// Members are provided as a list of in-game character IDs.
public fun create_treaty(
    treaty_type: u8,
    description: vector<u8>,
    alliance_a_name: vector<u8>,
    alliance_b_name: vector<u8>,
    alliance_b_leader: address,
    members_a: vector<u64>,
    deposit_required: u64,
    duration_ms: u64,
    mut deposit: Coin<SUI>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(treaty_type == TREATY_NAP || treaty_type == TREATY_CEASEFIRE, EInvalidTreatyType);
    assert!(deposit_required >= MIN_DEPOSIT, EDepositTooLow);
    if (treaty_type == TREATY_CEASEFIRE) {
        assert!(duration_ms > 0, EZeroDuration);
    };
    assert!(coin::value(&deposit) >= deposit_required, EInsufficientDeposit);

    // Take exact deposit amount, return change
    let deposit_coin = deposit.split(deposit_required, ctx);
    return_or_destroy(deposit, ctx);

    // Build member lookup table
    let mut member_table = table::new<u64, bool>(ctx);
    let member_count = members_a.length();
    let mut i = 0;
    while (i < member_count) {
        member_table.add(members_a[i], true);
        i = i + 1;
    };

    let now = clock.timestamp_ms();
    let expires = if (duration_ms > 0) { now + duration_ms } else { 0 };

    let treaty = Treaty {
        id: object::new(ctx),
        treaty_type,
        description: utf8(description),
        alliance_a_leader: ctx.sender(),
        alliance_b_leader,
        alliance_a_name: utf8(alliance_a_name),
        alliance_b_name: utf8(alliance_b_name),
        alliance_a_members: member_table,
        alliance_b_members: table::new<u64, bool>(ctx),
        alliance_a_member_count: member_count,
        alliance_b_member_count: 0,
        deposit_required,
        alliance_a_deposit: coin::into_balance(deposit_coin),
        alliance_b_deposit: balance::zero(),
        status: STATUS_PENDING,
        created_at_ms: now,
        effective_at_ms: 0,
        expires_at_ms: expires,
        violation_count: 0,
    };

    event::emit(TreatyCreated {
        treaty_id: object::id(&treaty),
        alliance_a_leader: ctx.sender(),
        alliance_b_leader,
        treaty_type,
        deposit_required,
        expires_at_ms: expires,
    });

    transfer::share_object(treaty);
}

/// Alliance B leader signs the treaty, deposits matching SUI, and the treaty becomes active.
public fun sign_treaty(
    treaty: &mut Treaty,
    members_b: vector<u64>,
    mut deposit: Coin<SUI>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == treaty.alliance_b_leader, ENotPartyB);
    assert!(treaty.status == STATUS_PENDING, ETreatyNotPending);
    assert!(coin::value(&deposit) >= treaty.deposit_required, EInsufficientDeposit);

    // Take exact deposit amount, return change
    let deposit_coin = deposit.split(treaty.deposit_required, ctx);
    return_or_destroy(deposit, ctx);

    // Build member lookup table for alliance B
    let member_count = members_b.length();
    let mut i = 0;
    while (i < member_count) {
        treaty.alliance_b_members.add(members_b[i], true);
        i = i + 1;
    };
    treaty.alliance_b_member_count = member_count;

    balance::join(&mut treaty.alliance_b_deposit, coin::into_balance(deposit_coin));
    treaty.status = STATUS_ACTIVE;
    treaty.effective_at_ms = clock.timestamp_ms();

    // If ceasefire, recalculate expiry from signing time
    if (treaty.treaty_type == TREATY_CEASEFIRE && treaty.expires_at_ms > 0) {
        let duration = treaty.expires_at_ms - treaty.created_at_ms;
        treaty.expires_at_ms = treaty.effective_at_ms + duration;
    };

    event::emit(TreatySigned {
        treaty_id: object::id(treaty),
        alliance_b_leader: ctx.sender(),
        effective_at_ms: treaty.effective_at_ms,
    });
}

/// Oracle reports a treaty violation based on KillMail evidence.
/// Uses graduated penalty: 1st violation = 20%, 2nd = 40%, 3rd = 100% + treaty terminated.
/// This models real diplomacy -- a single incident doesn't nuke the entire alliance relationship,
/// but repeated aggression escalates to full forfeiture.
public fun report_violation(
    _oracle: &OracleCap,
    treaty: &mut Treaty,
    attacker_character_id: u64,
    victim_character_id: u64,
    killmail_id: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(treaty.status == STATUS_ACTIVE, ETreatyNotActive);

    // Check treaty hasn't expired
    if (treaty.expires_at_ms > 0) {
        assert!(clock.timestamp_ms() < treaty.expires_at_ms, ETreatyExpired);
    };

    // Determine which alliance the attacker and victim belong to
    let attacker_in_a = treaty.alliance_a_members.contains(attacker_character_id);
    let attacker_in_b = treaty.alliance_b_members.contains(attacker_character_id);
    let victim_in_a = treaty.alliance_a_members.contains(victim_character_id);
    let victim_in_b = treaty.alliance_b_members.contains(victim_character_id);

    assert!(attacker_in_a || attacker_in_b, EAttackerNotMember);
    assert!(victim_in_a || victim_in_b, EVictimNotMember);

    // Attacker and victim must be from different alliances
    assert!(
        (attacker_in_a && victim_in_b) || (attacker_in_b && victim_in_a),
        ESameAlliance,
    );

    treaty.violation_count = treaty.violation_count + 1;

    // Graduated penalty: escalates with each violation
    let penalty_pct = if (treaty.violation_count >= MAX_VIOLATIONS_BEFORE_TERMINATION) {
        PENALTY_TIER_3_PCT
    } else if (treaty.violation_count == 2) {
        PENALTY_TIER_2_PCT
    } else {
        PENALTY_TIER_1_PCT
    };

    let is_terminal = treaty.violation_count >= MAX_VIOLATIONS_BEFORE_TERMINATION;

    // Calculate and transfer penalty from violator's deposit
    let (violating_leader, victim_leader, compensation) = if (attacker_in_a) {
        let deposit_total = balance::value(&treaty.alliance_a_deposit);
        let penalty_amount = if (is_terminal) {
            deposit_total
        } else {
            // Penalty based on original deposit, capped at remaining balance
            let calculated = treaty.deposit_required * penalty_pct / 100;
            if (calculated > deposit_total) { deposit_total } else { calculated }
        };
        if (penalty_amount > 0) {
            let payout = coin::take(&mut treaty.alliance_a_deposit, penalty_amount, ctx);
            transfer::public_transfer(payout, treaty.alliance_b_leader);
        };
        // On terminal violation, also return B's deposit
        if (is_terminal) {
            let b_remaining = balance::value(&treaty.alliance_b_deposit);
            if (b_remaining > 0) {
                let b_refund = coin::from_balance(
                    balance::withdraw_all(&mut treaty.alliance_b_deposit), ctx
                );
                transfer::public_transfer(b_refund, treaty.alliance_b_leader);
            };
        };
        (treaty.alliance_a_leader, treaty.alliance_b_leader, penalty_amount)
    } else {
        let deposit_total = balance::value(&treaty.alliance_b_deposit);
        let penalty_amount = if (is_terminal) {
            deposit_total
        } else {
            let calculated = treaty.deposit_required * penalty_pct / 100;
            if (calculated > deposit_total) { deposit_total } else { calculated }
        };
        if (penalty_amount > 0) {
            let payout = coin::take(&mut treaty.alliance_b_deposit, penalty_amount, ctx);
            transfer::public_transfer(payout, treaty.alliance_a_leader);
        };
        if (is_terminal) {
            let a_remaining = balance::value(&treaty.alliance_a_deposit);
            if (a_remaining > 0) {
                let a_refund = coin::from_balance(
                    balance::withdraw_all(&mut treaty.alliance_a_deposit), ctx
                );
                transfer::public_transfer(a_refund, treaty.alliance_a_leader);
            };
        };
        (treaty.alliance_b_leader, treaty.alliance_a_leader, penalty_amount)
    };

    // Terminal violation (3rd strike) ends the treaty
    if (is_terminal) {
        treaty.status = STATUS_VIOLATED;
    };

    // Create immutable violation record
    let record = ViolationRecord {
        id: object::new(ctx),
        treaty_id: object::id(treaty),
        attacker_character_id,
        victim_character_id,
        killmail_id,
        timestamp_ms: clock.timestamp_ms(),
        compensation,
    };
    transfer::transfer(record, victim_leader);

    event::emit(TreatyViolated {
        treaty_id: object::id(treaty),
        attacker_character_id,
        victim_character_id,
        killmail_id,
        violating_alliance: violating_leader,
        compensation,
    });
}

/// Complete an expired treaty. Both parties get their deposits back.
/// Anyone can call this once the treaty has expired.
public fun complete_treaty(
    treaty: &mut Treaty,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(treaty.status == STATUS_ACTIVE, ETreatyNotActive);
    assert!(treaty.expires_at_ms > 0, ETreatyNotExpired);
    assert!(clock.timestamp_ms() > treaty.expires_at_ms, ETreatyNotExpired);

    treaty.status = STATUS_COMPLETED;

    // Return deposits to both parties
    let a_amount = balance::value(&treaty.alliance_a_deposit);
    if (a_amount > 0) {
        let a_refund = coin::from_balance(
            balance::withdraw_all(&mut treaty.alliance_a_deposit), ctx
        );
        transfer::public_transfer(a_refund, treaty.alliance_a_leader);
    };

    let b_amount = balance::value(&treaty.alliance_b_deposit);
    if (b_amount > 0) {
        let b_refund = coin::from_balance(
            balance::withdraw_all(&mut treaty.alliance_b_deposit), ctx
        );
        transfer::public_transfer(b_refund, treaty.alliance_b_leader);
    };

    event::emit(TreatyCompleted {
        treaty_id: object::id(treaty),
    });
}

/// Cancel a pending treaty. Either party can cancel before it's signed.
public fun cancel_treaty(
    treaty: &mut Treaty,
    ctx: &mut TxContext,
) {
    let sender = ctx.sender();
    assert!(sender == treaty.alliance_a_leader || sender == treaty.alliance_b_leader, ENotParty);
    assert!(treaty.status == STATUS_PENDING, ETreatyNotPending);

    treaty.status = STATUS_CANCELLED;

    // Return A's deposit
    let a_amount = balance::value(&treaty.alliance_a_deposit);
    if (a_amount > 0) {
        let a_refund = coin::from_balance(
            balance::withdraw_all(&mut treaty.alliance_a_deposit), ctx
        );
        transfer::public_transfer(a_refund, treaty.alliance_a_leader);
    };

    event::emit(TreatyCancelled {
        treaty_id: object::id(treaty),
        cancelled_by: ctx.sender(),
    });
}

// === View Functions ===

public fun treaty_type(treaty: &Treaty): u8 { treaty.treaty_type }
public fun status(treaty: &Treaty): u8 { treaty.status }
public fun alliance_a_leader(treaty: &Treaty): address { treaty.alliance_a_leader }
public fun alliance_b_leader(treaty: &Treaty): address { treaty.alliance_b_leader }
public fun deposit_required(treaty: &Treaty): u64 { treaty.deposit_required }
public fun expires_at_ms(treaty: &Treaty): u64 { treaty.expires_at_ms }
public fun effective_at_ms(treaty: &Treaty): u64 { treaty.effective_at_ms }
public fun violation_count(treaty: &Treaty): u64 { treaty.violation_count }
public fun is_active(treaty: &Treaty, clock: &Clock): bool {
    if (treaty.status != STATUS_ACTIVE) { return false };
    if (treaty.expires_at_ms > 0 && clock.timestamp_ms() >= treaty.expires_at_ms) {
        return false
    };
    true
}
public fun is_member_a(treaty: &Treaty, character_id: u64): bool {
    treaty.alliance_a_members.contains(character_id)
}
public fun is_member_b(treaty: &Treaty, character_id: u64): bool {
    treaty.alliance_b_members.contains(character_id)
}

/// Check if a killmail (attacker/victim pair) would constitute a treaty violation.
/// Returns (is_violation, violating_alliance_leader) — enables trustless, decentralized
/// verification without relying on the oracle. Anyone can call this to audit whether
/// a specific kill violates a given treaty.
public fun verify_violation(
    treaty: &Treaty,
    attacker_character_id: u64,
    victim_character_id: u64,
    clock: &Clock,
): (bool, address) {
    // Treaty must be active and not expired
    if (!is_active(treaty, clock)) { return (false, @0x0) };

    let attacker_in_a = treaty.alliance_a_members.contains(attacker_character_id);
    let attacker_in_b = treaty.alliance_b_members.contains(attacker_character_id);
    let victim_in_a = treaty.alliance_a_members.contains(victim_character_id);
    let victim_in_b = treaty.alliance_b_members.contains(victim_character_id);

    // Both must be members of one of the two alliances
    if (!attacker_in_a && !attacker_in_b) { return (false, @0x0) };
    if (!victim_in_a && !victim_in_b) { return (false, @0x0) };

    // Cross-alliance kill = violation
    if (attacker_in_a && victim_in_b) {
        (true, treaty.alliance_a_leader)
    } else if (attacker_in_b && victim_in_a) {
        (true, treaty.alliance_b_leader)
    } else {
        // Same alliance — not a treaty violation
        (false, @0x0)
    }
}

// === Test Only ===

#[test_only]
public fun test_init(ctx: &mut TxContext) {
    init(ctx);
}

// === Internal Helpers ===

fun return_or_destroy(coin: Coin<SUI>, ctx: &TxContext) {
    if (coin::value(&coin) > 0) {
        transfer::public_transfer(coin, ctx.sender());
    } else {
        coin::destroy_zero(coin);
    }
}
