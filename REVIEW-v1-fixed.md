# REVIEW-v1 Fixes Applied

All 6 issues from REVIEW-v1.md have been addressed. Contract redeployed to testnet.

## Changes Made (in priority order)

### 1. Added `verify_violation` view function (EVE integration depth)
- New public function `verify_violation(treaty, attacker_id, victim_id, clock) -> (bool, address)`
- Returns whether a killmail would constitute a violation and which alliance leader is the violator
- Enables trustless, decentralized verification without relying on the oracle
- Anyone can audit whether a specific kill violates a given treaty

### 2. Both-party cancellation for PENDING treaties (UX)
- `cancel_treaty` now allows either Alliance A or Alliance B leader to cancel
- Changed assertion from `ENotPartyA` to `ENotParty` (sender must be A or B)
- Removed unused `ENotPartyA` error constant

### 3. Expiry boundary race condition fix (correctness)
- `report_violation`: changed `clock.timestamp_ms() <= treaty.expires_at_ms` to strict `<`
- `is_active` view: changed `clock.timestamp_ms() > treaty.expires_at_ms` to `>=`
- At the exact expiry timestamp, the treaty is now considered expired (no ambiguity)

### 4. Minimum deposit enforcement (economic soundness)
- Added `MIN_DEPOSIT = 100_000_000` constant (0.1 SUI)
- `create_treaty` now asserts `deposit_required >= MIN_DEPOSIT`
- Renamed error from `EZeroDeposit` to `EDepositTooLow`

### 5. Tests (quality)
- Added 23 tests covering the full treaty lifecycle:
  - Creation: NAP, ceasefire with expiry, deposit too low, invalid type (4 tests)
  - Signing: happy path, wrong sender (2 tests)
  - Violation: A attacks B, B attacks A, same alliance, unknown attacker, unknown victim (5 tests)
  - Expiry boundary: violation at exact expiry fails, 1ms before succeeds (2 tests)
  - Completion: expired treaty, before expiry fails, NAP (no expiry) fails (3 tests)
  - Cancellation: by party A, by party B, by stranger fails, active treaty fails (4 tests)
  - Verify violation: cross-alliance, expired treaty (2 tests)
  - Deposit math: change returned correctly (1 test)
- All 23 tests pass

### 6. Error code documentation (maintainability)
- Added `///` doc comments above all 13 error constants explaining their trigger conditions

## Deployment

- **New Package ID:** `0xc48837bf062d2d9ac489a6d9ce89fbfd8c77920e58f498efb7581800a615b3da`
- **TX Digest:** `uuWmVzDpzepumNhRBvxdtD8wPAkaaR5of1A33crsAUF`
- See DEPLOYED.md for full object IDs

## Nothing Remains

All items from the REVIEW-v1.md checklist are complete:
- [x] Decentralized violation verification function
- [x] Both-party cancellation for PENDING treaties
- [x] Expiry boundary fix (< instead of <=)
- [x] Minimum deposit enforcement
- [x] Automated tests (23 tests, all passing)
- [x] Error code documentation
