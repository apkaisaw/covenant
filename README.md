# Covenant

Self-executing diplomatic treaties for EVE Frontier. Sign on-chain, deposit collateral, break the pact, lose your stake.

## Problem

All diplomacy in EVE Frontier is verbal. Alliances negotiate non-aggression pacts in Discord, but there is no enforcement mechanism. Betrayal costs nothing beyond subjective reputation. There is no infrastructure for diplomacy with economic consequences.

## Solution

Covenant turns diplomatic agreements into self-enforcing smart contracts. Two alliances sign a treaty on-chain, each staking SUI as collateral. An off-chain oracle monitors KillMail events -- if a member of one alliance kills a member of the other, the contract automatically forfeits the violator's deposit to the victim. The blockchain is the judge.

## How It Works

```
Alliance A proposes treaty (terms + member list + SUI deposit)
    -> Alliance B reviews, adds members, deposits matching SUI, co-signs
    -> Treaty is ACTIVE -- publicly visible on-chain
    -> Off-chain indexer monitors KillmailCreatedEvent via GraphQL
    -> Cross-alliance kill detected: attacker in A, victim in B (or vice versa)
    -> Contract auto-penalizes: violator's deposit -> victim alliance
    -> ViolationRecord permanently stored on-chain
    -> If treaty expires with no violations: both sides reclaim deposits
```

## Technical Architecture

### Contract Objects

| Object | Type | Description |
|--------|------|-------------|
| `Treaty` | Shared | Treaty state: parties, member tables, deposits, status, expiry |
| `OracleCap` | Owned | Capability for the violation-reporting oracle service |
| `ViolationRecord` | Owned | Immutable evidence: attacker, victim, killmail ID, compensation |

### Entry Functions

| Function | Description |
|----------|-------------|
| `create_treaty` | Alliance A creates proposal with deposit (min 0.1 SUI) |
| `sign_treaty` | Alliance B co-signs with matching deposit, treaty activates |
| `report_violation` | Oracle submits KillMail evidence, triggers auto-penalty |
| `complete_treaty` | After expiry, both parties reclaim deposits |
| `cancel_treaty` | Either party cancels before signing |

### View Functions

| Function | Description |
|----------|-------------|
| `verify_violation` | Trustless check: does this killmail violate this treaty? |
| `is_active` | Is the treaty currently in force? |
| `is_member_a` / `is_member_b` | Is a character ID in alliance A or B? |

### Violation Detection Architecture

```
EVE Frontier Game World
    |
    v
KillmailCreatedEvent (on-chain)
    |
    v
Off-chain Indexer (GraphQL polling)
    |-- match attacker_id against treaty.alliance_a_members
    |-- match victim_id against treaty.alliance_b_members
    |-- (or vice versa)
    |
    v
report_violation(treaty, attacker_id, victim_id, killmail_id)
    |
    v
Auto-penalty: violator deposit -> victim leader
              victim deposit -> returned to victim leader
              ViolationRecord -> transferred to victim leader
              TreatyViolated event emitted
```

### State Machine

```
PENDING --[sign_treaty]--> ACTIVE --[report_violation]--> VIOLATED
                              |---[complete_treaty]-----> COMPLETED
                              |---[cancel_treaty]-------> CANCELLED (pending only)
```

### Events

| Event | Trigger |
|-------|---------|
| `TreatyCreated` | New treaty proposed |
| `TreatySigned` | Counterparty signs, treaty activates |
| `TreatyViolated` | KillMail violation detected, deposit forfeited |
| `TreatyCompleted` | Treaty expired normally, deposits returned |
| `TreatyCancelled` | Treaty cancelled before activation |

## Sui Features Used

- **Clock** -- treaty expiry validation
- **Events** -- 5 event types for full lifecycle indexing
- **Table** -- O(1) member lookup by character ID
- **Capabilities** -- OracleCap gates violation reporting (separation of concerns)
- **Coin/Balance** -- SUI deposit escrow and auto-transfer on violation
- **Shared Objects** -- Treaty accessible by both parties and oracle concurrently

## EVE Frontier Integration

**KillMail-driven violation detection.** The oracle monitors `KillmailCreatedEvent` and matches `killer_id`/`victim_id` against treaty member tables. This is the same off-chain indexer to on-chain enforcement pattern used by the highest-rated projects in the ecosystem.

**Decentralized verification.** `verify_violation()` is a public view function that lets anyone independently check whether a given killmail would violate a treaty -- no trust in the oracle required. This enables third-party auditing and dispute resolution.

**Character ID mapping.** Treaty members are stored as EVE in-game character IDs (u64), matching the `TenantItemId` format used by the world contract's `Killmail` object.

## Deployed on Testnet

| Field | Value |
|-------|-------|
| Package ID | `0xc48837bf062d2d9ac489a6d9ce89fbfd8c77920e58f498efb7581800a615b3da` |
| OracleCap | `0x6113acd7281d0386d0b5cd3f6fe832354a11f39972a8066e963fd0d217b0a595` |
| UpgradeCap | `0x6a930237363a8cedfcff6747c357c7e042829d36094fe1db284e51c92e39c670` |
| Network | Sui Testnet |

## Quick Start

Create a Non-Aggression Pact (Alliance A):

```bash
sui client call \
  --package 0xc48837bf062d2d9ac489a6d9ce89fbfd8c77920e58f498efb7581800a615b3da \
  --module covenant \
  --function create_treaty \
  --args 0 \                           # treaty_type: 0 = NAP
         '"Non-Aggression Pact"' \     # description
         '"Alpha Fleet"' \             # alliance_a_name
         '"Beta Corp"' \               # alliance_b_name
         0xB_LEADER_ADDRESS \          # alliance_b_leader
         '[1001, 1002, 1003]' \        # members_a (character IDs)
         500000000 \                   # deposit_required (0.5 SUI)
         0 \                           # duration_ms (0 = permanent)
         COIN_OBJECT_ID \              # deposit coin
         0x6                           # Clock
```

Alliance B co-signs:

```bash
sui client call \
  --package 0xc48837bf062d2d9ac489a6d9ce89fbfd8c77920e58f498efb7581800a615b3da \
  --module covenant \
  --function sign_treaty \
  --args TREATY_OBJECT_ID \
         '[2001, 2002, 2003]' \        # members_b (character IDs)
         COIN_OBJECT_ID \              # deposit coin
         0x6                           # Clock
```

Oracle reports a violation:

```bash
sui client call \
  --package 0xc48837bf062d2d9ac489a6d9ce89fbfd8c77920e58f498efb7581800a615b3da \
  --module covenant \
  --function report_violation \
  --args ORACLE_CAP_ID \
         TREATY_OBJECT_ID \
         1001 \                        # attacker_character_id
         2001 \                        # victim_character_id
         42 \                          # killmail_id
         0x6                           # Clock
```

## Tests

23 unit tests covering the full treaty lifecycle:

```bash
cd contracts/covenant && sui move test
```

## Category

- **Technical Implementation** -- self-executing penalties via KillMail oracle integration
- **Creative** -- first protocol to give diplomacy economic consequences
- **Utility** -- solves real alliance coordination and trust problems

## License

MIT

---

Built for the 2026 EVE Frontier x Sui Hackathon
