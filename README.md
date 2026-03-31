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

### Module Structure

```
covenant/sources/
  covenant.move        -- Treaty lifecycle, graduated penalty, deposit escrow
  treaty_registry.move -- Global treaty index, per-alliance reputation stats
  gate_enforcer.move   -- Smart Gate extension: deny passage to violating alliances
```

Three modules that compose into a system: treaties create economic stakes, the registry tracks reputation across all treaties, and the gate enforcer extends consequences into physical space.

### Contract Objects

| Object | Type | Module | Description |
|--------|------|--------|-------------|
| `Treaty` | Shared | covenant | Treaty state: parties, member tables, deposits, status, expiry |
| `OracleCap` | Owned | covenant | Capability for the violation-reporting oracle service |
| `ViolationRecord` | Owned | covenant | Immutable evidence: attacker, victim, killmail ID, compensation |
| `TreatyRegistry` | Shared | treaty_registry | Global treaty index + per-alliance reputation stats |
| `GateConfig` | Shared | gate_enforcer | Links Smart Gates to treaties for passage enforcement |

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

## Composability (Implemented)

Covenant is a three-module system, not a single contract:

- **Smart Gate enforcement** (`gate_enforcer.move`): Gate owners link their gates to treaties. The extension checks each character's alliance status before issuing a `JumpPermit` -- members of violating alliances are denied passage. Diplomacy has physical consequences. Uses the EVE world contract's `gate::issue_jump_permit<CovenantAuth>()` pattern.
- **Alliance reputation** (`treaty_registry.move`): Every treaty signing, violation, and completion updates per-alliance statistics. `alliance_honor_rate()` returns compliance in basis points (0-10000). An alliance that honored 8/10 treaties has an on-chain reputation score of 8000 bps -- queryable by any contract.
- **Prediction markets**: `verify_violation()` provides trustless resolution for "Will Alliance X violate Treaty Y?" positions.
- **Insurance protocols**: Underwriters can call `alliance_stats()` to price coverage based on violation history.

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
| Package ID | `0xdc38becdb1221fdf43444a50b2950bebb3ab47285df8ee756553973995e55670` |
| TreatyRegistry | `0x99b678e3952d2334ed1fc58ecbdd183e5e396fc181e5fcd690de35e9a3a414a0` |
| Network | Sui Testnet |
| Frontend | [covenant-eve.vercel.app](https://covenant-eve.vercel.app) |

## Try It

### Web (Browser)

Open [covenant-eve.vercel.app](https://covenant-eve.vercel.app), connect a Sui wallet (Testnet), and interact with treaties: browse, propose, sign, or cancel. CRT terminal aesthetic with graduated penalty visualization.

### CLI (Interactive)

Create a treaty from the terminal with a guided interactive flow:

```bash
cd demo && npm install
cp .env.example .env   # fill in LEADER_A_KEY
npx tsx create.ts       # prompts for counterparty address, confirms, submits
```

One input (counterparty address) + one confirmation (y/n) = treaty on-chain.

### Demo Script

Watch the full treaty lifecycle in ~36 seconds -- graduated penalty escalation from first strike to treaty termination:

```bash
npx tsx demo.ts --dry-run   # simulated output, no transactions
npx tsx demo.ts             # live mode with real Sui transactions
```

### KillMail Monitor (Off-chain Indexer)

The `indexer/` directory completes the enforcement loop -- polls `KillmailCreatedEvent` via Sui GraphQL, matches against treaty member lists, submits `report_violation()`:

```bash
cd indexer && npm install
cp .env.example .env
npx tsx monitor.ts --dry-run
```

### Tests

25 unit tests covering treaty lifecycle, graduated penalty escalation, and registry reputation:

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
