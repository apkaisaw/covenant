# Covenant

Self-executing diplomatic treaties for EVE Frontier. Sign on-chain, deposit collateral, break the pact, lose your stake.

## The Problem with Diplomacy

Every war in EVE starts the same way: someone breaks a promise.

Alliances negotiate non-aggression pacts in Discord. They shake hands over voice chat. Then someone's trigger-happy pilot blows up the wrong ship, and the whole deal unravels -- with no record, no accountability, no consequence.

Diplomacy in EVE Frontier has no enforcement layer. Betrayal is free.

## Covenant Changes the Game Theory

Covenant makes betrayal expensive. Two alliances sign a treaty on-chain, each staking SUI as collateral. An off-chain oracle monitors KillMail events -- if a member of one alliance kills a member of the other, the contract automatically penalizes the violator.

Not a binary nuke. A graduated response:

- **1st violation**: 20% of deposit forfeited (an incident, a warning)
- **2nd violation**: 40% forfeited (a pattern, escalation)
- **3rd violation**: 100% forfeited, treaty terminated (systematic aggression)

This models how real diplomacy works. A single friendly-fire incident doesn't destroy an alliance relationship. But repeated aggression escalates to full forfeiture. The game theory shifts: alliance leaders must actively police their own members, because every kill has a measurable cost.

**The blockchain is the judge. No arbitrator, no vote, no trust required.**

## How It Works

```
Alliance A proposes treaty (terms + member list + SUI deposit)
    -> Alliance B reviews, adds members, deposits matching SUI, co-signs
    -> Treaty is ACTIVE -- publicly visible on-chain
    -> Off-chain indexer monitors KillmailCreatedEvent via GraphQL
    -> Cross-alliance kill detected: attacker in A, victim in B
    -> Contract auto-penalizes: graduated % of violator's deposit -> victim
    -> ViolationRecord permanently stored on-chain
    -> 3rd strike: full forfeiture + treaty terminated
    -> If treaty expires cleanly: both sides reclaim full deposits
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
| `report_violation` | Oracle submits KillMail evidence, triggers graduated penalty |
| `complete_treaty` | After expiry, both parties reclaim deposits |
| `cancel_treaty` | Either party cancels before signing |

### Graduated Penalty Mechanism

| Violation | Penalty | Treaty Status |
|-----------|---------|---------------|
| 1st strike | 20% of deposit | ACTIVE (continues) |
| 2nd strike | 40% of deposit | ACTIVE (continues) |
| 3rd strike | 100% remaining | VIOLATED (terminated) |

Penalties are calculated against the original deposit amount and capped at the remaining balance. Each violation creates an immutable `ViolationRecord` transferred to the victim alliance leader.

### Violation Detection Architecture

```
EVE Frontier Game World
    |
    v
KillmailCreatedEvent (on-chain, player-reported)
    |
    v
Off-chain Indexer (GraphQL polling, 30s interval)
    |-- match killer_id against treaty.alliance_a_members (Table, O(1))
    |-- match victim_id against treaty.alliance_b_members
    |-- (or vice versa)
    |
    v
report_violation(treaty, attacker_id, victim_id, killmail_id)
    |
    v
Graduated penalty applied, ViolationRecord created, event emitted
```

### State Machine

```
PENDING --[sign_treaty]--> ACTIVE --[report_violation x3]--> VIOLATED
                              |---[complete_treaty]--------> COMPLETED
                              |---[cancel_treaty]----------> CANCELLED (pending only)
                              |---[report_violation x1-2]--> ACTIVE (penalty applied)
```

## Composability

Covenant's treaty state is designed to be consumed by other protocols:

- **Smart Gate integration**: A gate extension can call `is_active()` and `verify_violation()` to deny passage to members of alliances that violated a treaty -- enforcing diplomatic consequences at the infrastructure level.
- **Reputation systems**: Third-party contracts can index `TreatyViolated` and `TreatyCompleted` events to build alliance compliance scores. An alliance that honors 10 treaties has a verifiable on-chain reputation.
- **Prediction markets**: "Will Alliance X violate Treaty Y before expiry?" becomes a tradeable position, with `verify_violation()` providing trustless resolution.
- **Insurance protocols**: Underwriters can price coverage based on treaty violation history -- alliances with clean records get cheaper premiums.

The `verify_violation()` view function is the composability primitive: any contract can independently check whether a killmail violates a treaty without trusting the oracle.

## Oracle Decentralization Roadmap

| Version | Model | Trust |
|---------|-------|-------|
| **v1 (current)** | Single OracleCap holder | Centralized reporter, decentralized verification via `verify_violation()` |
| **v2** | Multi-oracle voting (N-of-M OracleCap) | Requires consensus among multiple reporters |
| **v3** | Fully permissionless | Anyone submits report with on-chain Killmail object reference; contract verifies directly against world state |

v1 is sufficient for hackathon scope. The architecture is designed so that upgrading the oracle model requires no changes to the treaty lifecycle or penalty logic.

## Sui Features Used

- **Clock** -- treaty expiry validation
- **Events** -- 5 event types for full lifecycle indexing
- **Table** -- O(1) member lookup by character ID
- **Capabilities** -- OracleCap gates violation reporting (separation of concerns)
- **Coin/Balance** -- SUI deposit escrow with graduated penalty math
- **Shared Objects** -- Treaty accessible by both parties and oracle concurrently

## EVE Frontier Integration

**KillMail-driven violation detection.** The oracle monitors `KillmailCreatedEvent` and matches `killer_id`/`victim_id` against treaty member tables. This is the same off-chain indexer to on-chain enforcement pattern used by the highest-rated projects in the ecosystem.

**Decentralized verification.** `verify_violation()` is a public view function that lets anyone independently check whether a given killmail would violate a treaty -- no trust in the oracle required.

**Character ID mapping.** Treaty members are stored as EVE in-game character IDs (u64), matching the `TenantItemId` format used by the world contract's `Killmail` object.

## Deployed on Testnet

| Field | Value |
|-------|-------|
| Package ID | `0xc48189767a999e843bcfc6ad8fcfca8a259935f7807d0c971b199af10a682044` |
| OracleCap | `0x080a0bcbb2c511cbaf711b00ae9b65e1769238349648faae7df8e24928961e7d` |
| Network | Sui Testnet |

## Quick Start

Create a Non-Aggression Pact (Alliance A):

```bash
sui client call \
  --package 0xc48189767a999e843bcfc6ad8fcfca8a259935f7807d0c971b199af10a682044 \
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
  --package 0xc48189767a999e843bcfc6ad8fcfca8a259935f7807d0c971b199af10a682044 \
  --module covenant \
  --function sign_treaty \
  --args TREATY_OBJECT_ID \
         '[2001, 2002, 2003]' \        # members_b (character IDs)
         COIN_OBJECT_ID \              # deposit coin
         0x6                           # Clock
```

## KillMail Monitor (Off-chain Indexer)

The `indexer/` directory contains a TypeScript service that completes the enforcement loop:

```
indexer/
  config.ts    -- environment + Sui client setup
  graphql.ts   -- KillmailCreatedEvent polling with cursor pagination
  treaties.ts  -- treaty loading, violation matching, TX submission
  monitor.ts   -- orchestration loop
```

```bash
cd indexer && npm install
cp .env.example .env   # fill in ORACLE_PRIVATE_KEY and WORLD_PACKAGE_ID
npx tsx monitor.ts             # live mode
npx tsx monitor.ts --dry-run   # log matches without submitting transactions
```

## Tests

24 unit tests covering treaty lifecycle, graduated penalty escalation, and edge cases:

```bash
cd contracts/covenant && sui move test
```

## Category

- **Technical Implementation** -- KillMail oracle with graduated penalty game theory
- **Creative** -- the only protocol that gives diplomacy economic consequences
- **Utility** -- changes how alliances coordinate trust in EVE Frontier

## License

MIT

---

Built for the 2026 EVE Frontier x Sui Hackathon
