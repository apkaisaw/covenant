# Covenant — Contract Review v1

**Score: 7.5 / 10 (highest of the five)**

## Summary

Well-structured treaty lifecycle (create → sign → active → violated/completed/cancelled) with correct use of all baseline patterns: Events, OracleCap, Shared Objects, Table, Clock. Closest to submission-ready among all five projects. Main gaps: only creator can cancel pending treaties, boundary race condition at expiry, zero tests.

## What's Good

- 5 complete events (TreatyCreated, TreatySigned, TreatyViolated, TreatyCompleted, TreatyCancelled)
- OracleCap correctly gates violation reporting (not AdminCap — proper separation of concerns)
- Treaty is shared object enabling concurrent access by both alliances and oracle
- Table<u64, bool> for O(1) member lookup
- Clock used for expiry validation in both violation reporting and completion
- Clear status state machine: PENDING(0) → ACTIVE(1) → VIOLATED(2) / COMPLETED(3) / CANCELLED(4)
- Deposit handling is correct: violator pays victim, both refunded on completion, creator refunded on cancellation
- ViolationRecord stored as dynamic field for permanent audit trail

## Medium Issues (P1)

### 1. Only creator (Alliance A) can cancel pending treaties

Alliance B leader has no way to cancel a pending treaty. If A creates a treaty and abandons it, B's attention is trapped.

**Fix:** Allow either party to cancel PENDING treaties:
```move
let is_a = ctx.sender() == treaty.alliance_a_leader;
let is_b = ctx.sender() == treaty.alliance_b_leader;
assert!(is_a || is_b, EUnauthorized);
```

### 2. Expiry boundary race condition

`report_violation` uses `<=` for expiry check:
```move
assert!(clock.timestamp_ms() <= treaty.expires_at_ms, ETreatyExpired);
```
If a killmail occurs at the exact expiry timestamp and both `report_violation` and `complete_treaty` are submitted in the same block, behavior depends on transaction ordering.

**Fix:** Use strict `<` in report_violation:
```move
assert!(clock.timestamp_ms() < treaty.expires_at_ms, ETreatyExpired);
```

### 3. No minimum deposit enforcement

A treaty can be created with 1 MIST deposit, making the economic deterrent meaningless.

**Fix:** Add minimum deposit constant (e.g., 0.1 SUI).

### 4. Error codes not documented

14 error constants (E0-E14) lack inline comments explaining their trigger conditions. Debugging is harder for integrators.

**Fix:** Add `/// Sender is not Alliance A leader` style comments above each constant.

## EVE Integration

Covenant has the strongest EVE integration design among all five projects: the OracleCap holder monitors KillmailCreatedEvent via GraphQL, matches attacker/victim against treaty member lists, and calls `report_violation` with the killmail digest as evidence.

**The integration is architectural (off-chain indexer → on-chain enforcement) — same pattern as Aegis Stack (S-tier).**

**Recommendation to strengthen:** Store the killmail_digest in the ViolationRecord (already done ✓). Consider adding a `verify_violation` view function that lets anyone check if a given killmail matches an active treaty, enabling decentralized verification without trusting the oracle.

## Missing

- [ ] Automated tests (0 — need 25+ covering full treaty lifecycle, violation detection, deposit math, edge cases)
- [ ] Both-party cancellation for PENDING treaties
- [ ] Expiry boundary fix (< instead of <=)
- [ ] Minimum deposit enforcement
- [ ] Error code documentation
- [ ] Decentralized violation verification function

## Priority Order

1. **Add EVE violation verification view function** (integration depth — allows trustless verification)
2. **Fix both-party cancellation** (UX)
3. **Fix expiry boundary** (correctness)
4. **Add minimum deposit** (economic soundness)
5. **Add tests** (quality)
6. **Document error codes** (maintainability)
