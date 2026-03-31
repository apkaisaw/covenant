# Covenant - Deployment Record

## Network

- **Network:** Sui Testnet
- **Deployer:** `0xc8ac0013ed934bddffda62301c1af9f1e72b9a7afd1aeb55d2561471a8d68bfd`
- **Date:** 2026-03-31
- **Version:** v3 (graduated penalty)

## Package (Current)

| Field | Value |
|-------|-------|
| Package ID | `0xc48189767a999e843bcfc6ad8fcfca8a259935f7807d0c971b199af10a682044` |
| Module | `covenant` |
| Version | 1 |

## Key Objects

| Object | ID | Owner |
|--------|----|-------|
| OracleCap | `0x080a0bcbb2c511cbaf711b00ae9b65e1769238349648faae7df8e24928961e7d` | Deployer |
| UpgradeCap | `0x61362d92ee7636b1c99f82b2b8b8c422f70c8a65a583c1ae53bb219c86ef4b29` | Deployer |

## Previous Deployments

| Version | Package ID |
|---------|------------|
| v2 | `0xc48837bf062d2d9ac489a6d9ce89fbfd8c77920e58f498efb7581800a615b3da` |
| v1 | `0x85f2d6945ca721f5eb40b3cb601692093fd635934022a244b152fb89bd90aa35` |

## Entry Functions

| Function | Description |
|----------|-------------|
| `create_treaty` | Alliance A creates proposal with deposit (min 0.1 SUI) |
| `sign_treaty` | Alliance B co-signs with matching deposit, treaty activates |
| `report_violation` | Oracle reports KillMail violation, graduated penalty applied |
| `complete_treaty` | After expiry, return deposits to both parties |
| `cancel_treaty` | Either party cancels a pending (unsigned) treaty |

## Graduated Penalty

| Strike | Penalty | Treaty Status |
|--------|---------|---------------|
| 1st | 20% of deposit | ACTIVE |
| 2nd | 40% of deposit | ACTIVE |
| 3rd | 100% remaining | VIOLATED (terminated) |
