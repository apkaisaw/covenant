#[test_only]
module covenant::covenant_tests;

use sui::test_scenario::{Self as ts, Scenario};
use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use covenant::covenant::{Self, Treaty, OracleCap, ViolationRecord};
use covenant::treaty_registry::{Self, TreatyRegistry};

// === Test addresses ===
const DEPLOYER: address = @0xDEAD;
const LEADER_A: address = @0xA;
const LEADER_B: address = @0xB;

// === Helpers ===

fun setup_scenario(): Scenario {
    let mut scenario = ts::begin(DEPLOYER);
    covenant::test_init(scenario.ctx());
    treaty_registry::test_init(scenario.ctx());
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
            0, b"Non-Aggression Pact between Alpha and Beta",
            b"Alpha", b"Beta", LEADER_B,
            members_a(), DEPOSIT, 0,
            deposit_coin, &clock, scenario.ctx(),
        );
        clock::destroy_for_testing(clock);
    };

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
            1, b"72h ceasefire", b"Alpha", b"Beta", LEADER_B,
            members_a(), DEPOSIT, ONE_DAY_MS * 3,
            deposit_coin, &clock, scenario.ctx(),
        );
        clock::destroy_for_testing(clock);
    };

    scenario.next_tx(LEADER_A);
    {
        let treaty = scenario.take_shared<Treaty>();
        assert!(covenant::treaty_type(&treaty) == 1);
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
            0, b"test", b"A", b"B", LEADER_B,
            members_a(), 1, 0,
            deposit_coin, &clock, scenario.ctx(),
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
            99, b"test", b"A", b"B", LEADER_B,
            members_a(), DEPOSIT, 0,
            deposit_coin, &clock, scenario.ctx(),
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
        let mut registry = scenario.take_shared<TreatyRegistry>();
        let clock = create_clock(2000, scenario.ctx());
        let deposit_coin = mint_sui(ONE_SUI, scenario.ctx());
        covenant::sign_treaty(
            &mut treaty, &mut registry,
            members_b(), deposit_coin, &clock, scenario.ctx(),
        );
        assert!(covenant::status(&treaty) == 1); // ACTIVE
        assert!(covenant::effective_at_ms(&treaty) == 2000);
        assert!(covenant::is_member_b(&treaty, 2001));
        assert!(treaty_registry::treaty_count(&registry) == 1);
        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
        ts::return_shared(registry);
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

    scenario.next_tx(LEADER_A);
    {
        let mut treaty = scenario.take_shared<Treaty>();
        let mut registry = scenario.take_shared<TreatyRegistry>();
        let clock = create_clock(2000, scenario.ctx());
        let deposit_coin = mint_sui(ONE_SUI, scenario.ctx());
        covenant::sign_treaty(
            &mut treaty, &mut registry,
            members_b(), deposit_coin, &clock, scenario.ctx(),
        );
        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
        ts::return_shared(registry);
    };

    scenario.end();
}

// ============================================================
// Violation reporting (graduated penalty)
// ============================================================

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
        let mut registry = scenario.take_shared<TreatyRegistry>();
        let clock = create_clock(2000, scenario.ctx());
        let deposit_coin = mint_sui(ONE_SUI, scenario.ctx());
        covenant::sign_treaty(
            &mut treaty, &mut registry,
            members_b(), deposit_coin, &clock, scenario.ctx(),
        );
        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
        ts::return_shared(registry);
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
        let mut registry = scenario.take_shared<TreatyRegistry>();
        let clock = create_clock(2000, scenario.ctx());
        let deposit_coin = mint_sui(ONE_SUI, scenario.ctx());
        covenant::sign_treaty(
            &mut treaty, &mut registry,
            members_b(), deposit_coin, &clock, scenario.ctx(),
        );
        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
        ts::return_shared(registry);
    };
}

#[test]
fun test_report_violation_graduated() {
    let mut scenario = setup_scenario();
    create_active_treaty(&mut scenario);

    // 1st violation: 20% penalty, treaty stays ACTIVE
    scenario.next_tx(DEPLOYER);
    {
        let oracle = scenario.take_from_sender<OracleCap>();
        let mut treaty = scenario.take_shared<Treaty>();
        let mut registry = scenario.take_shared<TreatyRegistry>();
        let clock = create_clock(5000, scenario.ctx());
        covenant::report_violation(
            &oracle, &mut treaty, &mut registry,
            1001, 2001, 42, &clock, scenario.ctx(),
        );
        assert!(covenant::status(&treaty) == 1); // still ACTIVE
        assert!(covenant::violation_count(&treaty) == 1);
        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
        ts::return_shared(registry);
        scenario.return_to_sender(oracle);
    };

    scenario.next_tx(LEADER_B);
    { let r = scenario.take_from_sender<ViolationRecord>(); scenario.return_to_sender(r); };

    scenario.end();
}

#[test]
fun test_graduated_penalty_escalation() {
    let mut scenario = setup_scenario();
    create_active_treaty(&mut scenario);

    // 1st violation: 20%
    scenario.next_tx(DEPLOYER);
    {
        let oracle = scenario.take_from_sender<OracleCap>();
        let mut treaty = scenario.take_shared<Treaty>();
        let mut registry = scenario.take_shared<TreatyRegistry>();
        let clock = create_clock(5000, scenario.ctx());
        covenant::report_violation(
            &oracle, &mut treaty, &mut registry,
            1001, 2001, 1, &clock, scenario.ctx(),
        );
        assert!(covenant::status(&treaty) == 1);
        assert!(covenant::violation_count(&treaty) == 1);
        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
        ts::return_shared(registry);
        scenario.return_to_sender(oracle);
    };
    scenario.next_tx(LEADER_B);
    { let r = scenario.take_from_sender<ViolationRecord>(); scenario.return_to_sender(r); };

    // 2nd violation: 40%
    scenario.next_tx(DEPLOYER);
    {
        let oracle = scenario.take_from_sender<OracleCap>();
        let mut treaty = scenario.take_shared<Treaty>();
        let mut registry = scenario.take_shared<TreatyRegistry>();
        let clock = create_clock(6000, scenario.ctx());
        covenant::report_violation(
            &oracle, &mut treaty, &mut registry,
            1002, 2002, 2, &clock, scenario.ctx(),
        );
        assert!(covenant::status(&treaty) == 1);
        assert!(covenant::violation_count(&treaty) == 2);
        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
        ts::return_shared(registry);
        scenario.return_to_sender(oracle);
    };
    scenario.next_tx(LEADER_B);
    { let r = scenario.take_from_sender<ViolationRecord>(); scenario.return_to_sender(r); };

    // 3rd violation: 100%, treaty TERMINATED
    scenario.next_tx(DEPLOYER);
    {
        let oracle = scenario.take_from_sender<OracleCap>();
        let mut treaty = scenario.take_shared<Treaty>();
        let mut registry = scenario.take_shared<TreatyRegistry>();
        let clock = create_clock(7000, scenario.ctx());
        covenant::report_violation(
            &oracle, &mut treaty, &mut registry,
            1003, 2003, 3, &clock, scenario.ctx(),
        );
        assert!(covenant::status(&treaty) == 2); // VIOLATED
        assert!(covenant::violation_count(&treaty) == 3);

        // Check registry stats
        let (signed, _, violated, _) = treaty_registry::alliance_stats(&registry, LEADER_A);
        assert!(signed == 1);
        assert!(violated == 3); // 3 violations by A

        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
        ts::return_shared(registry);
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

    scenario.next_tx(DEPLOYER);
    {
        let oracle = scenario.take_from_sender<OracleCap>();
        let mut treaty = scenario.take_shared<Treaty>();
        let mut registry = scenario.take_shared<TreatyRegistry>();
        let clock = create_clock(5000, scenario.ctx());
        covenant::report_violation(
            &oracle, &mut treaty, &mut registry,
            2002, 1003, 99, &clock, scenario.ctx(),
        );
        assert!(covenant::status(&treaty) == 1); // ACTIVE
        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
        ts::return_shared(registry);
        scenario.return_to_sender(oracle);
    };

    scenario.next_tx(LEADER_A);
    { let r = scenario.take_from_sender<ViolationRecord>(); scenario.return_to_sender(r); };

    scenario.end();
}

#[test]
#[expected_failure(abort_code = 11)]
fun test_report_violation_same_alliance() {
    let mut scenario = setup_scenario();
    create_active_treaty(&mut scenario);
    scenario.next_tx(DEPLOYER);
    {
        let oracle = scenario.take_from_sender<OracleCap>();
        let mut treaty = scenario.take_shared<Treaty>();
        let mut registry = scenario.take_shared<TreatyRegistry>();
        let clock = create_clock(5000, scenario.ctx());
        covenant::report_violation(
            &oracle, &mut treaty, &mut registry,
            1001, 1002, 50, &clock, scenario.ctx(),
        );
        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
        ts::return_shared(registry);
        scenario.return_to_sender(oracle);
    };
    scenario.end();
}

#[test]
#[expected_failure(abort_code = 9)]
fun test_report_violation_unknown_attacker() {
    let mut scenario = setup_scenario();
    create_active_treaty(&mut scenario);
    scenario.next_tx(DEPLOYER);
    {
        let oracle = scenario.take_from_sender<OracleCap>();
        let mut treaty = scenario.take_shared<Treaty>();
        let mut registry = scenario.take_shared<TreatyRegistry>();
        let clock = create_clock(5000, scenario.ctx());
        covenant::report_violation(
            &oracle, &mut treaty, &mut registry,
            9999, 2001, 50, &clock, scenario.ctx(),
        );
        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
        ts::return_shared(registry);
        scenario.return_to_sender(oracle);
    };
    scenario.end();
}

#[test]
#[expected_failure(abort_code = 10)]
fun test_report_violation_unknown_victim() {
    let mut scenario = setup_scenario();
    create_active_treaty(&mut scenario);
    scenario.next_tx(DEPLOYER);
    {
        let oracle = scenario.take_from_sender<OracleCap>();
        let mut treaty = scenario.take_shared<Treaty>();
        let mut registry = scenario.take_shared<TreatyRegistry>();
        let clock = create_clock(5000, scenario.ctx());
        covenant::report_violation(
            &oracle, &mut treaty, &mut registry,
            1001, 9999, 50, &clock, scenario.ctx(),
        );
        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
        ts::return_shared(registry);
        scenario.return_to_sender(oracle);
    };
    scenario.end();
}

// ============================================================
// Expiry boundary
// ============================================================

#[test]
#[expected_failure(abort_code = 6)]
fun test_violation_at_exact_expiry_fails() {
    let mut scenario = setup_scenario();
    create_active_ceasefire(&mut scenario, ONE_DAY_MS);
    let expiry_ms = 2000 + ONE_DAY_MS;
    scenario.next_tx(DEPLOYER);
    {
        let oracle = scenario.take_from_sender<OracleCap>();
        let mut treaty = scenario.take_shared<Treaty>();
        let mut registry = scenario.take_shared<TreatyRegistry>();
        let clock = create_clock(expiry_ms, scenario.ctx());
        covenant::report_violation(
            &oracle, &mut treaty, &mut registry,
            1001, 2001, 50, &clock, scenario.ctx(),
        );
        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
        ts::return_shared(registry);
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
        let mut registry = scenario.take_shared<TreatyRegistry>();
        let clock = create_clock(expiry_ms - 1, scenario.ctx());
        covenant::report_violation(
            &oracle, &mut treaty, &mut registry,
            1001, 2001, 50, &clock, scenario.ctx(),
        );
        assert!(covenant::status(&treaty) == 1); // graduated: 1st violation
        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
        ts::return_shared(registry);
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
        let mut registry = scenario.take_shared<TreatyRegistry>();
        let clock = create_clock(expiry_ms + 1, scenario.ctx());
        covenant::complete_treaty(&mut treaty, &mut registry, &clock, scenario.ctx());
        assert!(covenant::status(&treaty) == 3); // COMPLETED

        // Both alliances should have 1 honored treaty
        let rate_a = treaty_registry::alliance_honor_rate(&registry, LEADER_A);
        let rate_b = treaty_registry::alliance_honor_rate(&registry, LEADER_B);
        assert!(rate_a == 10000); // 1/1 = 100%
        assert!(rate_b == 10000);

        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
        ts::return_shared(registry);
    };
    scenario.end();
}

#[test]
#[expected_failure(abort_code = 7)]
fun test_complete_before_expiry_fails() {
    let mut scenario = setup_scenario();
    create_active_ceasefire(&mut scenario, ONE_DAY_MS);
    scenario.next_tx(LEADER_A);
    {
        let mut treaty = scenario.take_shared<Treaty>();
        let mut registry = scenario.take_shared<TreatyRegistry>();
        let clock = create_clock(3000, scenario.ctx());
        covenant::complete_treaty(&mut treaty, &mut registry, &clock, scenario.ctx());
        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
        ts::return_shared(registry);
    };
    scenario.end();
}

#[test]
#[expected_failure(abort_code = 7)]
fun test_complete_nap_fails() {
    let mut scenario = setup_scenario();
    create_active_treaty(&mut scenario);
    scenario.next_tx(LEADER_A);
    {
        let mut treaty = scenario.take_shared<Treaty>();
        let mut registry = scenario.take_shared<TreatyRegistry>();
        let clock = create_clock(999_999_999_999, scenario.ctx());
        covenant::complete_treaty(&mut treaty, &mut registry, &clock, scenario.ctx());
        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
        ts::return_shared(registry);
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
        assert!(covenant::status(&treaty) == 4);
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
    scenario.next_tx(LEADER_B);
    {
        let mut treaty = scenario.take_shared<Treaty>();
        covenant::cancel_treaty(&mut treaty, scenario.ctx());
        assert!(covenant::status(&treaty) == 4);
        ts::return_shared(treaty);
    };
    scenario.end();
}

#[test]
#[expected_failure(abort_code = 2)]
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
    scenario.next_tx(@0xBAD);
    {
        let mut treaty = scenario.take_shared<Treaty>();
        covenant::cancel_treaty(&mut treaty, scenario.ctx());
        ts::return_shared(treaty);
    };
    scenario.end();
}

#[test]
#[expected_failure(abort_code = 4)]
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
        let (v1, a1) = covenant::verify_violation(&treaty, 1001, 2001, &clock);
        assert!(v1);
        assert!(a1 == LEADER_A);
        let (v2, a2) = covenant::verify_violation(&treaty, 2002, 1003, &clock);
        assert!(v2);
        assert!(a2 == LEADER_B);
        let (v3, _) = covenant::verify_violation(&treaty, 1001, 1002, &clock);
        assert!(!v3);
        let (v4, _) = covenant::verify_violation(&treaty, 9999, 2001, &clock);
        assert!(!v4);
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
        let (v, _) = covenant::verify_violation(&treaty, 1001, 2001, &clock);
        assert!(!v);
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
    scenario.next_tx(LEADER_A);
    {
        let change = scenario.take_from_sender<Coin<SUI>>();
        assert!(coin::value(&change) == 2 * ONE_SUI - DEPOSIT);
        scenario.return_to_sender(change);
    };
    scenario.end();
}

// ============================================================
// Treaty Registry
// ============================================================

#[test]
fun test_registry_honor_rate() {
    let mut scenario = setup_scenario();

    // Create and complete a ceasefire (honored by both)
    create_active_ceasefire(&mut scenario, ONE_DAY_MS);
    let expiry_ms = 2000 + ONE_DAY_MS;
    scenario.next_tx(LEADER_A);
    {
        let mut treaty = scenario.take_shared<Treaty>();
        let mut registry = scenario.take_shared<TreatyRegistry>();
        let clock = create_clock(expiry_ms + 1, scenario.ctx());
        covenant::complete_treaty(&mut treaty, &mut registry, &clock, scenario.ctx());

        let rate_a = treaty_registry::alliance_honor_rate(&registry, LEADER_A);
        assert!(rate_a == 10000); // 100%

        // Unknown alliance should return 10000 (benefit of the doubt)
        let rate_unknown = treaty_registry::alliance_honor_rate(&registry, @0xFFFF);
        assert!(rate_unknown == 10000);

        clock::destroy_for_testing(clock);
        ts::return_shared(treaty);
        ts::return_shared(registry);
    };

    scenario.end();
}
