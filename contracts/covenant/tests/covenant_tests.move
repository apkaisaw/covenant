#[test_only]
module covenant::covenant_tests;

use sui::test_scenario::{Self as ts, Scenario};
use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use covenant::covenant::{Self, Treaty, OracleCap, ViolationRecord};

// === Test addresses ===
const DEPLOYER: address = @0xDEAD;
const LEADER_A: address = @0xA;
const LEADER_B: address = @0xB;

// === Helpers ===

fun setup_scenario(): Scenario {
    let mut scenario = ts::begin(DEPLOYER);
    // init creates OracleCap for deployer
    covenant::test_init(scenario.ctx());
    scenario
}

fun mint_sui(amount: u64, ctx: &mut TxContext): Coin<SUI> {
    coin::mint_for_testing<SUI>(amount, ctx)
}

fun create_clock(ts_ms: u64, ctx: &mut TxContext): Clock {
    let mut c = clock::create_for_testing(ctx);
    clock::set_for_testing(&mut c, ts_ms);
    c
}

fun members_a(): vector<u64> { vector[1001, 1002, 1003] }
fun members_b(): vector<u64> { vector[2001, 2002, 2003] }

const ONE_SUI: u64 = 1_000_000_000;
const DEPOSIT: u64 = 500_000_000; // 0.5 SUI
const ONE_DAY_MS: u64 = 86_400_000;

// ============================================================
// Treaty creation
// ============================================================

#[test]
fun test_create_treaty_nap() {
    let mut scenario = setup_scenario();

    scenario.next_tx(LEADER_A);
    {
        let clock = create_clock(1000, scenario.ctx());
        let deposit_coin = mint_sui(ONE_SUI, scenario.ctx());
        covenant::create_treaty(
            0, // NAP
            b"Non-Aggression Pact between Alpha and Beta",
            b"Alpha",
            b"Beta",
            LEADER_B,
            members_a(),
            DEPOSIT,
            0, // no expiry for NAP
            deposit_coin,
            &clock,
            scenario.ctx(),
        );
        clock::destroy_for_testing(clock);
    };

    // Treaty should exist as shared object
    scenario.next_tx(LEADER_A);
    {
        let treaty = scenario.take_shared<Treaty>();
        assert!(covenant::status(&treaty) == 0); // PENDING
        assert!(covenant::treaty_type(&treaty) == 0); // NAP
        assert!(covenant::alliance_a_leader(&treaty) == LEADER_A);
        assert!(covenant::alliance_b_leader(&treaty) == LEADER_B);
        assert!(covenant::deposit_required(&treaty) == DEPOSIT);
        assert!(covenant::is_member_a(&treaty, 1001));
        assert!(covenant::is_member_a(&treaty, 1002));
        assert!(covenant::is_member_a(&treaty, 1003));
        assert!(!covenant::is_member_a(&treaty, 9999));
        ts::return_shared(treaty);
    };

    scenario.end();
}

#[test]
fun test_create_treaty_ceasefire_with_expiry() {
    let mut scenario = setup_scenario();

    scenario.next_tx(LEADER_A);
    {
        let clock = create_clock(1000, scenario.ctx());
        let deposit_coin = mint_sui(ONE_SUI, scenario.ctx());
        covenant::create_treaty(
            1, // CEASEFIRE
            b"72h ceasefire",
            b"Alpha",
            b"Beta",
            LEADER_B,
            members_a(),
            DEPOSIT,
            ONE_DAY_MS * 3, // 72 hours
            deposit_coin,
            &clock,
            scenario.ctx(),
        );
        clock::destroy_for_testing(clock);
    };

    scenario.next_tx(LEADER_A);
    {
        let treaty = scenario.take_shared<Treaty>();
        assert!(covenant::treaty_type(&treaty) == 1); // CEASEFIRE
        assert!(covenant::expires_at_ms(&treaty) > 0);
        ts::return_shared(treaty);
    };

    scenario.end();
}

#[test]
#[expected_failure(abort_code = 14)] // EDepositTooLow
fun test_create_treaty_deposit_too_low() {
    let mut scenario = setup_scenario();

    scenario.next_tx(LEADER_A);
    {
        let clock = create_clock(1000, scenario.ctx());
        let deposit_coin = mint_sui(ONE_SUI, scenario.ctx());
        covenant::create_treaty(
            0,
            b"test",
            b"A",
            b"B",
            LEADER_B,
            members_a(),
            1, // 1 MIST — below minimum
            0,
            deposit_coin,
            &clock,
            scenario.ctx(),
        );
        clock::destroy_for_testing(clock);
    };

    scenario.end();
}

#[test]
#[expected_failure(abort_code = 12)] // EInvalidTreatyType
fun test_create_treaty_invalid_type() {
    let mut scenario = setup_scenario();

    scenario.next_tx(LEADER_A);
    {
        let clock = create_clock(1000, scenario.ctx());
        let deposit_coin = mint_sui(ONE_SUI, scenario.ctx());
        covenant::create_treaty(
            99, // invalid
            b"test",
            b"A",
            b"B",
            LEADER_B,
            members_a(),
            DEPOSIT,
            0,
            deposit_coin,
            &clock,
            scenario.ctx(),
        );
        clock::destroy_for_testing(clock);
    };

    scenario.end();
}

// ============================================================
// Treaty signing
// ============================================================

#[test]
fun test_sign_treaty() {
    let mut scenario = setup_scenario();

    // Create treaty
    scenario.next_tx(LEADER_A);
    {
        let clock = create_clock(1000, scenario.ctx());
        let deposit_coin = mint_sui(ONE_SUI, scenario.ctx());
        covenant::create_treaty(
            0, b"NAP", b"Alpha", b"Beta", LEADER_B,
            members_a(), DEPOSIT, 0,
            deposit_coin, &clock, scenario.ctx(),
        );
        clock::destroy_for_testing(clock);
    };

    // Sign treaty as B
    scenario.next_tx(LEADER_B);
    {
        let mut treaty = scenario.take_shared<Treaty>();
        let clock = create_clock(2000, scenario.ctx());
        let deposit_coin = mint_sui(ONE_SUI, scenario.ctx());
        covenant::sign_treaty(
            &mut treaty,
            members_b(),
            deposit_coin,
            &clock,
            scenario.ctx(),
        );
        assert!(covenant::status(&treaty) == 1); // ACTIVE
        assert!(covenant::effective_at_ms(&treaty) == 2000);
        assert!(covenant::is_member_b(&treaty, 2001));
        assert!(covenant::is_member_b(&treaty, 2002));
        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
    };

    scenario.end();
}

#[test]
#[expected_failure(abort_code = 1)] // ENotPartyB
fun test_sign_treaty_wrong_sender() {
    let mut scenario = setup_scenario();

    scenario.next_tx(LEADER_A);
    {
        let clock = create_clock(1000, scenario.ctx());
        let deposit_coin = mint_sui(ONE_SUI, scenario.ctx());
        covenant::create_treaty(
            0, b"NAP", b"Alpha", b"Beta", LEADER_B,
            members_a(), DEPOSIT, 0,
            deposit_coin, &clock, scenario.ctx(),
        );
        clock::destroy_for_testing(clock);
    };

    // Try to sign as A (should fail)
    scenario.next_tx(LEADER_A);
    {
        let mut treaty = scenario.take_shared<Treaty>();
        let clock = create_clock(2000, scenario.ctx());
        let deposit_coin = mint_sui(ONE_SUI, scenario.ctx());
        covenant::sign_treaty(
            &mut treaty,
            members_b(),
            deposit_coin,
            &clock,
            scenario.ctx(),
        );
        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
    };

    scenario.end();
}

// ============================================================
// Violation reporting
// ============================================================

/// Helper: create and sign a NAP treaty, return scenario ready for next action
fun create_active_treaty(scenario: &mut Scenario) {
    scenario.next_tx(LEADER_A);
    {
        let clock = create_clock(1000, scenario.ctx());
        let deposit_coin = mint_sui(ONE_SUI, scenario.ctx());
        covenant::create_treaty(
            0, b"NAP", b"Alpha", b"Beta", LEADER_B,
            members_a(), DEPOSIT, 0,
            deposit_coin, &clock, scenario.ctx(),
        );
        clock::destroy_for_testing(clock);
    };
    scenario.next_tx(LEADER_B);
    {
        let mut treaty = scenario.take_shared<Treaty>();
        let clock = create_clock(2000, scenario.ctx());
        let deposit_coin = mint_sui(ONE_SUI, scenario.ctx());
        covenant::sign_treaty(
            &mut treaty, members_b(), deposit_coin, &clock, scenario.ctx(),
        );
        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
    };
}

fun create_active_ceasefire(scenario: &mut Scenario, duration_ms: u64) {
    scenario.next_tx(LEADER_A);
    {
        let clock = create_clock(1000, scenario.ctx());
        let deposit_coin = mint_sui(ONE_SUI, scenario.ctx());
        covenant::create_treaty(
            1, b"Ceasefire", b"Alpha", b"Beta", LEADER_B,
            members_a(), DEPOSIT, duration_ms,
            deposit_coin, &clock, scenario.ctx(),
        );
        clock::destroy_for_testing(clock);
    };
    scenario.next_tx(LEADER_B);
    {
        let mut treaty = scenario.take_shared<Treaty>();
        let clock = create_clock(2000, scenario.ctx());
        let deposit_coin = mint_sui(ONE_SUI, scenario.ctx());
        covenant::sign_treaty(
            &mut treaty, members_b(), deposit_coin, &clock, scenario.ctx(),
        );
        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
    };
}

#[test]
fun test_report_violation_a_attacks_b_graduated() {
    let mut scenario = setup_scenario();
    create_active_treaty(&mut scenario);

    // 1st violation: 20% penalty, treaty stays ACTIVE
    scenario.next_tx(DEPLOYER);
    {
        let oracle = scenario.take_from_sender<OracleCap>();
        let mut treaty = scenario.take_shared<Treaty>();
        let clock = create_clock(5000, scenario.ctx());
        covenant::report_violation(
            &oracle, &mut treaty,
            1001, 2001, 42,
            &clock, scenario.ctx(),
        );
        assert!(covenant::status(&treaty) == 1); // still ACTIVE
        assert!(covenant::violation_count(&treaty) == 1);
        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
        scenario.return_to_sender(oracle);
    };

    // B receives ViolationRecord
    scenario.next_tx(LEADER_B);
    {
        let record = scenario.take_from_sender<ViolationRecord>();
        scenario.return_to_sender(record);
    };

    scenario.end();
}

#[test]
fun test_graduated_penalty_escalation() {
    let mut scenario = setup_scenario();
    create_active_treaty(&mut scenario);

    // 1st violation: 20% of deposit (0.5 SUI * 20% = 0.1 SUI)
    scenario.next_tx(DEPLOYER);
    {
        let oracle = scenario.take_from_sender<OracleCap>();
        let mut treaty = scenario.take_shared<Treaty>();
        let clock = create_clock(5000, scenario.ctx());
        covenant::report_violation(
            &oracle, &mut treaty, 1001, 2001, 1, &clock, scenario.ctx(),
        );
        assert!(covenant::status(&treaty) == 1); // ACTIVE
        assert!(covenant::violation_count(&treaty) == 1);
        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
        scenario.return_to_sender(oracle);
    };
    // Collect ViolationRecord
    scenario.next_tx(LEADER_B);
    { let r = scenario.take_from_sender<ViolationRecord>(); scenario.return_to_sender(r); };

    // 2nd violation: 40% of deposit (0.5 SUI * 40% = 0.2 SUI)
    scenario.next_tx(DEPLOYER);
    {
        let oracle = scenario.take_from_sender<OracleCap>();
        let mut treaty = scenario.take_shared<Treaty>();
        let clock = create_clock(6000, scenario.ctx());
        covenant::report_violation(
            &oracle, &mut treaty, 1002, 2002, 2, &clock, scenario.ctx(),
        );
        assert!(covenant::status(&treaty) == 1); // still ACTIVE
        assert!(covenant::violation_count(&treaty) == 2);
        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
        scenario.return_to_sender(oracle);
    };
    scenario.next_tx(LEADER_B);
    { let r = scenario.take_from_sender<ViolationRecord>(); scenario.return_to_sender(r); };

    // 3rd violation: 100% remaining, treaty TERMINATED
    scenario.next_tx(DEPLOYER);
    {
        let oracle = scenario.take_from_sender<OracleCap>();
        let mut treaty = scenario.take_shared<Treaty>();
        let clock = create_clock(7000, scenario.ctx());
        covenant::report_violation(
            &oracle, &mut treaty, 1003, 2003, 3, &clock, scenario.ctx(),
        );
        assert!(covenant::status(&treaty) == 2); // VIOLATED (terminated)
        assert!(covenant::violation_count(&treaty) == 3);
        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
        scenario.return_to_sender(oracle);
    };
    scenario.next_tx(LEADER_B);
    { let r = scenario.take_from_sender<ViolationRecord>(); scenario.return_to_sender(r); };

    scenario.end();
}

#[test]
fun test_report_violation_b_attacks_a() {
    let mut scenario = setup_scenario();
    create_active_treaty(&mut scenario);

    // B attacks A: graduated penalty, treaty stays ACTIVE after 1st
    scenario.next_tx(DEPLOYER);
    {
        let oracle = scenario.take_from_sender<OracleCap>();
        let mut treaty = scenario.take_shared<Treaty>();
        let clock = create_clock(5000, scenario.ctx());
        covenant::report_violation(
            &oracle, &mut treaty,
            2002, 1003, 99,
            &clock, scenario.ctx(),
        );
        assert!(covenant::status(&treaty) == 1); // ACTIVE (graduated)
        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
        scenario.return_to_sender(oracle);
    };

    // Victim leader (A) should receive ViolationRecord
    scenario.next_tx(LEADER_A);
    {
        let record = scenario.take_from_sender<ViolationRecord>();
        scenario.return_to_sender(record);
    };

    scenario.end();
}

#[test]
#[expected_failure(abort_code = 11)] // ESameAlliance
fun test_report_violation_same_alliance() {
    let mut scenario = setup_scenario();
    create_active_treaty(&mut scenario);

    scenario.next_tx(DEPLOYER);
    {
        let oracle = scenario.take_from_sender<OracleCap>();
        let mut treaty = scenario.take_shared<Treaty>();
        let clock = create_clock(5000, scenario.ctx());
        // 1001 and 1002 are both in Alliance A
        covenant::report_violation(
            &oracle, &mut treaty, 1001, 1002, 50, &clock, scenario.ctx(),
        );
        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
        scenario.return_to_sender(oracle);
    };

    scenario.end();
}

#[test]
#[expected_failure(abort_code = 9)] // EAttackerNotMember
fun test_report_violation_unknown_attacker() {
    let mut scenario = setup_scenario();
    create_active_treaty(&mut scenario);

    scenario.next_tx(DEPLOYER);
    {
        let oracle = scenario.take_from_sender<OracleCap>();
        let mut treaty = scenario.take_shared<Treaty>();
        let clock = create_clock(5000, scenario.ctx());
        covenant::report_violation(
            &oracle, &mut treaty, 9999, 2001, 50, &clock, scenario.ctx(),
        );
        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
        scenario.return_to_sender(oracle);
    };

    scenario.end();
}

#[test]
#[expected_failure(abort_code = 10)] // EVictimNotMember
fun test_report_violation_unknown_victim() {
    let mut scenario = setup_scenario();
    create_active_treaty(&mut scenario);

    scenario.next_tx(DEPLOYER);
    {
        let oracle = scenario.take_from_sender<OracleCap>();
        let mut treaty = scenario.take_shared<Treaty>();
        let clock = create_clock(5000, scenario.ctx());
        covenant::report_violation(
            &oracle, &mut treaty, 1001, 9999, 50, &clock, scenario.ctx(),
        );
        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
        scenario.return_to_sender(oracle);
    };

    scenario.end();
}

// ============================================================
// Expiry boundary
// ============================================================

#[test]
#[expected_failure(abort_code = 6)] // ETreatyExpired
fun test_violation_at_exact_expiry_fails() {
    let mut scenario = setup_scenario();
    create_active_ceasefire(&mut scenario, ONE_DAY_MS);

    // The ceasefire expires at effective_at_ms + duration = 2000 + 86400000
    let expiry_ms = 2000 + ONE_DAY_MS;

    scenario.next_tx(DEPLOYER);
    {
        let oracle = scenario.take_from_sender<OracleCap>();
        let mut treaty = scenario.take_shared<Treaty>();
        let clock = create_clock(expiry_ms, scenario.ctx()); // exactly at expiry
        covenant::report_violation(
            &oracle, &mut treaty, 1001, 2001, 50, &clock, scenario.ctx(),
        );
        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
        scenario.return_to_sender(oracle);
    };

    scenario.end();
}

#[test]
fun test_violation_just_before_expiry_succeeds() {
    let mut scenario = setup_scenario();
    create_active_ceasefire(&mut scenario, ONE_DAY_MS);

    let expiry_ms = 2000 + ONE_DAY_MS;

    scenario.next_tx(DEPLOYER);
    {
        let oracle = scenario.take_from_sender<OracleCap>();
        let mut treaty = scenario.take_shared<Treaty>();
        let clock = create_clock(expiry_ms - 1, scenario.ctx()); // 1ms before expiry
        covenant::report_violation(
            &oracle, &mut treaty, 1001, 2001, 50, &clock, scenario.ctx(),
        );
        assert!(covenant::status(&treaty) == 1); // ACTIVE (graduated: 1st violation)
        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
        scenario.return_to_sender(oracle);
    };

    scenario.end();
}

// ============================================================
// Treaty completion
// ============================================================

#[test]
fun test_complete_expired_treaty() {
    let mut scenario = setup_scenario();
    create_active_ceasefire(&mut scenario, ONE_DAY_MS);

    let expiry_ms = 2000 + ONE_DAY_MS;

    scenario.next_tx(LEADER_A);
    {
        let mut treaty = scenario.take_shared<Treaty>();
        let clock = create_clock(expiry_ms + 1, scenario.ctx());
        covenant::complete_treaty(&mut treaty, &clock, scenario.ctx());
        assert!(covenant::status(&treaty) == 3); // COMPLETED
        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
    };

    scenario.end();
}

#[test]
#[expected_failure(abort_code = 7)] // ETreatyNotExpired
fun test_complete_before_expiry_fails() {
    let mut scenario = setup_scenario();
    create_active_ceasefire(&mut scenario, ONE_DAY_MS);

    scenario.next_tx(LEADER_A);
    {
        let mut treaty = scenario.take_shared<Treaty>();
        let clock = create_clock(3000, scenario.ctx()); // way before expiry
        covenant::complete_treaty(&mut treaty, &clock, scenario.ctx());
        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
    };

    scenario.end();
}

#[test]
#[expected_failure(abort_code = 7)] // ETreatyNotExpired — NAP has no expiry
fun test_complete_nap_fails() {
    let mut scenario = setup_scenario();
    create_active_treaty(&mut scenario); // NAP, no expiry

    scenario.next_tx(LEADER_A);
    {
        let mut treaty = scenario.take_shared<Treaty>();
        let clock = create_clock(999_999_999_999, scenario.ctx());
        covenant::complete_treaty(&mut treaty, &clock, scenario.ctx());
        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
    };

    scenario.end();
}

// ============================================================
// Treaty cancellation
// ============================================================

#[test]
fun test_cancel_by_party_a() {
    let mut scenario = setup_scenario();

    scenario.next_tx(LEADER_A);
    {
        let clock = create_clock(1000, scenario.ctx());
        let deposit_coin = mint_sui(ONE_SUI, scenario.ctx());
        covenant::create_treaty(
            0, b"NAP", b"Alpha", b"Beta", LEADER_B,
            members_a(), DEPOSIT, 0,
            deposit_coin, &clock, scenario.ctx(),
        );
        clock::destroy_for_testing(clock);
    };

    scenario.next_tx(LEADER_A);
    {
        let mut treaty = scenario.take_shared<Treaty>();
        covenant::cancel_treaty(&mut treaty, scenario.ctx());
        assert!(covenant::status(&treaty) == 4); // CANCELLED
        ts::return_shared(treaty);
    };

    scenario.end();
}

#[test]
fun test_cancel_by_party_b() {
    let mut scenario = setup_scenario();

    scenario.next_tx(LEADER_A);
    {
        let clock = create_clock(1000, scenario.ctx());
        let deposit_coin = mint_sui(ONE_SUI, scenario.ctx());
        covenant::create_treaty(
            0, b"NAP", b"Alpha", b"Beta", LEADER_B,
            members_a(), DEPOSIT, 0,
            deposit_coin, &clock, scenario.ctx(),
        );
        clock::destroy_for_testing(clock);
    };

    // B can also cancel pending treaties
    scenario.next_tx(LEADER_B);
    {
        let mut treaty = scenario.take_shared<Treaty>();
        covenant::cancel_treaty(&mut treaty, scenario.ctx());
        assert!(covenant::status(&treaty) == 4); // CANCELLED
        ts::return_shared(treaty);
    };

    scenario.end();
}

#[test]
#[expected_failure(abort_code = 2)] // ENotParty
fun test_cancel_by_stranger_fails() {
    let mut scenario = setup_scenario();

    scenario.next_tx(LEADER_A);
    {
        let clock = create_clock(1000, scenario.ctx());
        let deposit_coin = mint_sui(ONE_SUI, scenario.ctx());
        covenant::create_treaty(
            0, b"NAP", b"Alpha", b"Beta", LEADER_B,
            members_a(), DEPOSIT, 0,
            deposit_coin, &clock, scenario.ctx(),
        );
        clock::destroy_for_testing(clock);
    };

    // Stranger cannot cancel
    scenario.next_tx(@0xBAD);
    {
        let mut treaty = scenario.take_shared<Treaty>();
        covenant::cancel_treaty(&mut treaty, scenario.ctx());
        ts::return_shared(treaty);
    };

    scenario.end();
}

#[test]
#[expected_failure(abort_code = 4)] // ETreatyNotPending
fun test_cancel_active_treaty_fails() {
    let mut scenario = setup_scenario();
    create_active_treaty(&mut scenario);

    scenario.next_tx(LEADER_A);
    {
        let mut treaty = scenario.take_shared<Treaty>();
        covenant::cancel_treaty(&mut treaty, scenario.ctx());
        ts::return_shared(treaty);
    };

    scenario.end();
}

// ============================================================
// verify_violation view function
// ============================================================

#[test]
fun test_verify_violation_cross_alliance() {
    let mut scenario = setup_scenario();
    create_active_treaty(&mut scenario);

    scenario.next_tx(DEPLOYER);
    {
        let treaty = scenario.take_shared<Treaty>();
        let clock = create_clock(5000, scenario.ctx());

        // A attacks B — violation, violator is A leader
        let (is_violation, violator) = covenant::verify_violation(
            &treaty, 1001, 2001, &clock
        );
        assert!(is_violation);
        assert!(violator == LEADER_A);

        // B attacks A — violation, violator is B leader
        let (is_violation2, violator2) = covenant::verify_violation(
            &treaty, 2002, 1003, &clock
        );
        assert!(is_violation2);
        assert!(violator2 == LEADER_B);

        // Same alliance — not a violation
        let (is_violation3, _) = covenant::verify_violation(
            &treaty, 1001, 1002, &clock
        );
        assert!(!is_violation3);

        // Unknown attacker — not a violation
        let (is_violation4, _) = covenant::verify_violation(
            &treaty, 9999, 2001, &clock
        );
        assert!(!is_violation4);

        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
    };

    scenario.end();
}

#[test]
fun test_verify_violation_expired_treaty() {
    let mut scenario = setup_scenario();
    create_active_ceasefire(&mut scenario, ONE_DAY_MS);

    let expiry_ms = 2000 + ONE_DAY_MS;

    scenario.next_tx(DEPLOYER);
    {
        let treaty = scenario.take_shared<Treaty>();
        let clock = create_clock(expiry_ms + 1, scenario.ctx());

        // Expired treaty — verify_violation should return false
        let (is_violation, _) = covenant::verify_violation(
            &treaty, 1001, 2001, &clock
        );
        assert!(!is_violation);

        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
    };

    scenario.end();
}

// ============================================================
// Deposit math
// ============================================================

#[test]
fun test_deposit_change_returned() {
    let mut scenario = setup_scenario();

    // Create with 2 SUI but only 0.5 SUI required — should get 1.5 SUI change
    scenario.next_tx(LEADER_A);
    {
        let clock = create_clock(1000, scenario.ctx());
        let deposit_coin = mint_sui(2 * ONE_SUI, scenario.ctx());
        covenant::create_treaty(
            0, b"NAP", b"Alpha", b"Beta", LEADER_B,
            members_a(), DEPOSIT, 0,
            deposit_coin, &clock, scenario.ctx(),
        );
        clock::destroy_for_testing(clock);
    };

    // Leader A should have received change coin
    scenario.next_tx(LEADER_A);
    {
        let change = scenario.take_from_sender<Coin<SUI>>();
        assert!(coin::value(&change) == 2 * ONE_SUI - DEPOSIT); // 1.5 SUI
        scenario.return_to_sender(change);
    };

    scenario.end();
}
