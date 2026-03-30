# Covenant - Deployment Record

## Network

- **Network:** Sui Testnet
- **Deployer:** `0xc8ac0013ed934bddffda62301c1af9f1e72b9a7afd1aeb55d2561471a8d68bfd`
- **Deployment TX:** `7BoSRc8DaM5iYj5bAwxqFjmFoYH5gzUqiN9VXUL7ZjHf`
- **Date:** 2026-03-31

## Package

| Field | Value |
|-------|-------|
| Package ID | `0x85f2d6945ca721f5eb40b3cb601692093fd635934022a244b152fb89bd90aa35` |
| Module | `covenant` |
| Version | 1 |

## Key Objects

| Object | ID | Owner |
|--------|----|-------|
| OracleCap | `0x4cd748ecad40cfe1e8cf841dd6b34445f63f8d39dc15cdd79b43b627c8fdb5fc` | Deployer |
| UpgradeCap | `0xafb0c7ba1784d43cc8e0b525cc50ea84f9e16eb2fa1e9708caf699d27db61e24` | Deployer |

## Entry Functions

| Function | Description |
|----------|-------------|
| `create_treaty` | Alliance A leader creates a treaty proposal with deposit |
| `sign_treaty` | Alliance B leader signs and deposits, treaty becomes active |
| `report_violation` | Oracle reports KillMail violation, violator's deposit compensates victim |
| `complete_treaty` | After expiry, return deposits to both parties |
| `cancel_treaty` | Creator cancels a pending (unsigned) treaty |

## Events

| Event | Emitted When |
|-------|-------------|
| `TreatyCreated` | New treaty proposal created |
| `TreatySigned` | Counterparty signs, treaty becomes active |
| `TreatyViolated` | KillMail violation detected, deposit forfeited |
| `TreatyCompleted` | Treaty expired normally, deposits returned |
| `TreatyCancelled` | Pending treaty cancelled by creator |

## Gas Cost

- Storage: 37,232,400 MIST
- Computation: 1,000,000 MIST
- Total: ~0.037 SUI
