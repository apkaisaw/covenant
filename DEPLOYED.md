# Covenant - Deployment Record

## Network

- **Network:** Sui Testnet
- **Deployer:** `0xc8ac0013ed934bddffda62301c1af9f1e72b9a7afd1aeb55d2561471a8d68bfd`
- **Deployment TX:** `uuWmVzDpzepumNhRBvxdtD8wPAkaaR5of1A33crsAUF`
- **Date:** 2026-03-31
- **Version:** v2 (review fixes applied)

## Package

| Field | Value |
|-------|-------|
| Package ID | `0xc48837bf062d2d9ac489a6d9ce89fbfd8c77920e58f498efb7581800a615b3da` |
| Module | `covenant` |
| Version | 1 |

## Key Objects

| Object | ID | Owner |
|--------|----|-------|
| OracleCap | `0x6113acd7281d0386d0b5cd3f6fe832354a11f39972a8066e963fd0d217b0a595` | Deployer |
| UpgradeCap | `0x6a930237363a8cedfcff6747c357c7e042829d36094fe1db284e51c92e39c670` | Deployer |

## Previous Deployment (v1)

| Field | Value |
|-------|-------|
| Package ID | `0x85f2d6945ca721f5eb40b3cb601692093fd635934022a244b152fb89bd90aa35` |
| TX Digest | `7BoSRc8DaM5iYj5bAwxqFjmFoYH5gzUqiN9VXUL7ZjHf` |

## Entry Functions

| Function | Description |
|----------|-------------|
| `create_treaty` | Alliance A leader creates a treaty proposal with deposit (min 0.1 SUI) |
| `sign_treaty` | Alliance B leader signs and deposits, treaty becomes active |
| `report_violation` | Oracle reports KillMail violation, violator's deposit compensates victim |
| `complete_treaty` | After expiry, return deposits to both parties |
| `cancel_treaty` | Either party cancels a pending (unsigned) treaty |

## View Functions

| Function | Description |
|----------|-------------|
| `verify_violation` | Trustless check if a killmail (attacker/victim) would violate this treaty |
| `is_active` | Check if treaty is currently active and not expired |
| `is_member_a` / `is_member_b` | Check if a character ID is in alliance A or B |

## Events

| Event | Emitted When |
|-------|-------------|
| `TreatyCreated` | New treaty proposal created |
| `TreatySigned` | Counterparty signs, treaty becomes active |
| `TreatyViolated` | KillMail violation detected, deposit forfeited |
| `TreatyCompleted` | Treaty expired normally, deposits returned |
| `TreatyCancelled` | Pending treaty cancelled by either party |

## E2E Test Treaty

| Field | Value |
|-------|-------|
| Treaty Object | `0x7ff3ab71ba0c112a0cf04584c31284477161d198632650f6a520415f0bee8b7b` |
| Alliance A Leader | `0xc8ac...8bfd` (covenant) |
| Alliance B Leader | `0x7832...dd22` (augury) |
| Members A | `[1001, 1002, 1003]` |
| Members B | `[2001, 2002, 2003]` |
| Deposit | 0.1 SUI each |
| Status | ACTIVE |
| Indexer Test | Passed (13 KillMails polled, treaty loaded with 3+3 members) |

## Gas Cost

- v1 deployment: ~0.037 SUI
- v2 deployment: ~0.040 SUI
- Total spent: ~0.077 SUI
