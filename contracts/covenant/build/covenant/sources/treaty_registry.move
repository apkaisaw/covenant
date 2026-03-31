/// Global treaty index and alliance reputation tracking.
///
/// Maintains a registry of all treaties and per-alliance statistics
/// (treaties signed, honored, violated, total compensation paid).
/// Enables on-chain reputation queries: alliance_honor_rate() returns
/// the compliance rate in basis points (0-10000).
module covenant::treaty_registry;

use sui::table::{Self, Table};
use sui::event;

// === Structs ===

/// Per-alliance diplomatic statistics.
public struct AllianceRecord has store, copy, drop {
    treaties_signed: u64,
    treaties_honored: u64,
    treaties_violated: u64,
    total_compensation_paid: u64,
}

/// Global registry of all treaties and alliance reputations.
/// Created once at module init, shared object.
public struct TreatyRegistry has key {
    id: UID,
    // treaty_count -> treaty object ID
    treaties: Table<u64, ID>,
    treaty_count: u64,
    // alliance leader address -> stats
    alliance_records: Table<address, AllianceRecord>,
}

// === Events ===

public struct TreatyRegistered has copy, drop {
    treaty_id: ID,
    index: u64,
    alliance_a: address,
    alliance_b: address,
}

public struct AllianceStatsUpdated has copy, drop {
    alliance: address,
    treaties_signed: u64,
    treaties_honored: u64,
    treaties_violated: u64,
}

// === Init ===

fun init(ctx: &mut TxContext) {
    let registry = TreatyRegistry {
        id: object::new(ctx),
        treaties: table::new(ctx),
        treaty_count: 0,
        alliance_records: table::new(ctx),
    };
    transfer::share_object(registry);
}

// === Package Functions (called by covenant.move) ===

/// Register a new treaty when it becomes ACTIVE (both parties signed).
public(package) fun register_treaty(
    registry: &mut TreatyRegistry,
    treaty_id: ID,
    alliance_a: address,
    alliance_b: address,
) {
    let index = registry.treaty_count;
    registry.treaties.add(index, treaty_id);
    registry.treaty_count = index + 1;

    // Initialize alliance records if first treaty
    ensure_alliance_exists(registry, alliance_a);
    ensure_alliance_exists(registry, alliance_b);

    // Increment treaties_signed for both
    let rec_a = registry.alliance_records.borrow_mut(alliance_a);
    rec_a.treaties_signed = rec_a.treaties_signed + 1;
    let rec_b = registry.alliance_records.borrow_mut(alliance_b);
    rec_b.treaties_signed = rec_b.treaties_signed + 1;

    event::emit(TreatyRegistered { treaty_id, index, alliance_a, alliance_b });
}

/// Record a violation: increment violated count and compensation for the violator.
public(package) fun record_violation(
    registry: &mut TreatyRegistry,
    violator: address,
    compensation: u64,
) {
    ensure_alliance_exists(registry, violator);
    let rec = registry.alliance_records.borrow_mut(violator);
    rec.treaties_violated = rec.treaties_violated + 1;
    rec.total_compensation_paid = rec.total_compensation_paid + compensation;

    event::emit(AllianceStatsUpdated {
        alliance: violator,
        treaties_signed: rec.treaties_signed,
        treaties_honored: rec.treaties_honored,
        treaties_violated: rec.treaties_violated,
    });
}

/// Record treaty completion: both alliances honored the treaty.
public(package) fun record_completion(
    registry: &mut TreatyRegistry,
    alliance_a: address,
    alliance_b: address,
) {
    ensure_alliance_exists(registry, alliance_a);
    ensure_alliance_exists(registry, alliance_b);

    let rec_a = registry.alliance_records.borrow_mut(alliance_a);
    rec_a.treaties_honored = rec_a.treaties_honored + 1;
    let rec_b = registry.alliance_records.borrow_mut(alliance_b);
    rec_b.treaties_honored = rec_b.treaties_honored + 1;
}

// === View Functions ===

/// Alliance honor rate in basis points (0-10000).
/// An alliance that honored 8 out of 10 treaties returns 8000.
/// Returns 10000 if no treaties signed (benefit of the doubt).
public fun alliance_honor_rate(registry: &TreatyRegistry, alliance: address): u64 {
    if (!registry.alliance_records.contains(alliance)) { return 10000 };
    let rec = registry.alliance_records.borrow(alliance);
    if (rec.treaties_signed == 0) { return 10000 };
    // honored / signed * 10000
    rec.treaties_honored * 10000 / rec.treaties_signed
}

public fun alliance_stats(registry: &TreatyRegistry, alliance: address): (u64, u64, u64, u64) {
    if (!registry.alliance_records.contains(alliance)) { return (0, 0, 0, 0) };
    let rec = registry.alliance_records.borrow(alliance);
    (rec.treaties_signed, rec.treaties_honored, rec.treaties_violated, rec.total_compensation_paid)
}

public fun treaty_count(registry: &TreatyRegistry): u64 {
    registry.treaty_count
}

// === Internal ===

fun ensure_alliance_exists(registry: &mut TreatyRegistry, alliance: address) {
    if (!registry.alliance_records.contains(alliance)) {
        registry.alliance_records.add(alliance, AllianceRecord {
            treaties_signed: 0,
            treaties_honored: 0,
            treaties_violated: 0,
            total_compensation_paid: 0,
        });
    };
}

// === Test Only ===

#[test_only]
public fun test_init(ctx: &mut TxContext) {
    init(ctx);
}
