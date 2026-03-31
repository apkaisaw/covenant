/**
 * Covenant Demo — Full Treaty Lifecycle
 *
 * Walks through the entire flow in ~60 seconds:
 *   PROPOSE → SIGN → VIOLATION x3 (graduated penalty) → TREATY TERMINATED
 *
 * Usage:
 *   npx tsx demo.ts              # live mode (real transactions)
 *   npx tsx demo.ts --dry-run    # simulated output only
 */

import "dotenv/config";
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";

// ═══════════════════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════════════════

const PKG = process.env.PACKAGE_ID || "0xdc38becdb1221fdf43444a50b2950bebb3ab47285df8ee756553973995e55670";
const ORACLE_CAP = process.env.ORACLE_CAP_ID || "0xfa7bb70ef18442a260bfa177738ee57c3c14b6338f1a29c25a564b778bb798d0";
const REGISTRY = process.env.TREATY_REGISTRY_ID || "0x99b678e3952d2334ed1fc58ecbdd183e5e396fc181e5fcd690de35e9a3a414a0";
const CLOCK = "0x6";
const DRY_RUN = process.argv.includes("--dry-run");

const client = new SuiClient({ url: "https://fullnode.testnet.sui.io:443" });

// ═══════════════════════════════════════════════════════════════════════════
// ASCII Visual Helpers
// ═══════════════════════════════════════════════════════════════════════════

const W = 72; // frame width (inner)

const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  gold:   "\x1b[38;2;184;148;62m",
  bone:   "\x1b[38;2;232;220;200m",
  orange: "\x1b[38;2;232;93;38m",
  rust:   "\x1b[38;2;139;37;0m",
  green:  "\x1b[38;2;163;190;140m",
  bg:     "\x1b[48;2;26;18;9m",
};

function banner(title: string) {
  const line = "═".repeat(W);
  console.log();
  console.log(`${C.gold}  ╔${line}╗${C.reset}`);
  console.log(`${C.gold}  ║${C.bold}${C.bone}  ${title.padEnd(W - 2)}${C.reset}${C.gold}║${C.reset}`);
  console.log(`${C.gold}  ╚${line}╝${C.reset}`);
  console.log();
}

function phase(num: number, title: string) {
  const label = `─── ${C.bold}PHASE ${num}${C.reset}${C.gold} ─── ${title} `;
  const remaining = Math.max(0, W - 10 - title.length - 8);
  console.log(`${C.gold}  ┌${label}${"─".repeat(remaining)}┐${C.reset}`);
}

function phaseEnd() {
  console.log(`${C.gold}  └${"─".repeat(W)}┘${C.reset}`);
  console.log();
}

function separator() {
  console.log(`${C.gold}  │${C.dim}  ${"· ".repeat(Math.floor(W / 2 - 1))}${C.reset}${C.gold}│${C.reset}`);
}

const LINE_DELAY = 200;

async function log(msg: string) {
  console.log(`${C.gold}  │${C.reset}  ${msg}`);
  await sleep(LINE_DELAY);
}

async function logPair(label: string, value: string) {
  console.log(`${C.gold}  │${C.reset}  ${C.dim}${label.padEnd(22)}${C.reset} ${value}`);
  await sleep(LINE_DELAY);
}

async function logOk(msg: string) {
  console.log(`${C.gold}  │${C.reset}  ${C.green}✓${C.reset} ${msg}`);
  await sleep(400);
}

async function logWarn(msg: string) {
  console.log(`${C.gold}  │${C.reset}  ${C.orange}⚠${C.reset}  ${msg}`);
  await sleep(600);
}

async function logViolation(msg: string) {
  console.log(`${C.gold}  │${C.reset}`);
  console.log(`${C.gold}  │${C.reset}  ${C.orange}${C.bold}  ▓▓▓  KILLMAIL DETECTED  ▓▓▓${C.reset}`);
  console.log(`${C.gold}  │${C.reset}  ${C.orange}  ${msg}${C.reset}`);
  console.log(`${C.gold}  │${C.reset}`);
  await sleep(1000);
}

function strikeBar(count: number): string {
  return [0, 1, 2].map(i =>
    i < count ? `${C.orange}●${C.reset}` : `${C.dim}○${C.reset}`
  ).join("  ");
}

function depositBar(remaining: number, total: number): string {
  const pct = remaining / total;
  const barWidth = 20;
  const filled = Math.round(pct * barWidth);
  const empty = barWidth - filled;
  const bar = `${C.gold}${"━".repeat(filled)}${C.dim}${"·".repeat(empty)}${C.reset}`;
  const pctStr = `${Math.round(pct * 100)}%`;
  return `${bar}  ${(remaining / 1e9).toFixed(2)} SUI (${pctStr})`;
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function addr(a: string): string {
  return `${C.gold}${a.slice(0, 10)}...${a.slice(-8)}${C.reset}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Wallet Setup
// ═══════════════════════════════════════════════════════════════════════════

function loadKey(envName: string): Ed25519Keypair | null {
  const raw = process.env[envName];
  if (!raw) return null;
  try {
    const { schema, secretKey } = decodeSuiPrivateKey(raw);
    if (schema !== "ED25519") return null;
    return Ed25519Keypair.fromSecretKey(secretKey);
  } catch {
    return Ed25519Keypair.fromSecretKey(Uint8Array.from(Buffer.from(raw, "base64")));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Transaction Helpers
// ═══════════════════════════════════════════════════════════════════════════

async function execTx(signer: Ed25519Keypair, build: (tx: Transaction) => void): Promise<string> {
  const tx = new Transaction();
  build(tx);
  const result = await client.signAndExecuteTransaction({
    signer, transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });
  if (result.effects?.status?.status !== "success") {
    throw new Error(`TX failed: ${JSON.stringify(result.effects?.status)}`);
  }
  return result.digest;
}

// ═══════════════════════════════════════════════════════════════════════════
// Demo Flow
// ═══════════════════════════════════════════════════════════════════════════

async function demo() {
  banner("COVENANT — Self-Executing Treaties for EVE Frontier");

  console.log(`${C.bone}  Every war in EVE starts the same way: someone breaks a promise.${C.reset}`);
  console.log(`${C.bone}  Covenant makes betrayal expensive — the blockchain is the judge.${C.reset}`);
  console.log();

  if (DRY_RUN) {
    console.log(`${C.rust}  ┌────────────────────────────────────────────┐${C.reset}`);
    console.log(`${C.rust}  │  DRY RUN MODE — no transactions submitted  │${C.reset}`);
    console.log(`${C.rust}  └────────────────────────────────────────────┘${C.reset}`);
    console.log();
  }

  await logPair("Package ID", PKG.slice(0, 24) + "...");
  await logPair("Network", "Sui Testnet");
  await logPair("Penalty Model", "Graduated: 20% → 40% → 100%");
  await logPair("Mode", DRY_RUN ? "Simulated (no real TX)" : `${C.green}Live${C.reset}`);
  console.log();

  const leaderA = loadKey("LEADER_A_KEY");
  const leaderB = loadKey("LEADER_B_KEY");
  const oracle = loadKey("ORACLE_KEY");

  if (!DRY_RUN && (!leaderA || !leaderB || !oracle)) {
    console.error("  Missing keys. Set LEADER_A_KEY, LEADER_B_KEY, ORACLE_KEY in .env");
    console.error("  Or run with --dry-run for simulated output.");
    process.exit(1);
  }

  const addrA = leaderA?.getPublicKey().toSuiAddress() || "0xc8ac0013ed93...a8d68bfd";
  const addrB = leaderB?.getPublicKey().toSuiAddress() || "0x783231d8fecc...4917dd22";

  await sleep(2500);

  // ═══════════════════════════════════════════════════════
  // PHASE 1: PROPOSE
  // ═══════════════════════════════════════════════════════

  phase(1, "PROPOSE — Alliance A drafts a treaty");

  await log(`${C.bone}Two alliances agree to stop fighting. But talk is cheap.${C.reset}`);
  await log(`${C.bone}Alpha Fleet proposes a Non-Aggression Pact with economic stakes.${C.reset}`);
  separator();
  await logPair("Alliance A", `${C.bone}${C.bold}Alpha Fleet${C.reset}`);
  await logPair("Alliance B", `${C.bone}${C.bold}Beta Corp${C.reset}`);
  await logPair("Leader A", addr(addrA));
  await logPair("Leader B", addr(addrB));
  await logPair("Treaty Type", "Non-Aggression Pact (NAP)");
  await logPair("Deposit Required", "0.1 SUI per side");
  await logPair("Duration", "Permanent (no expiry)");
  await logPair("Members A", "Pilots #1001, #1002, #1003");
  separator();

  const DEPOSIT = 100_000_000;
  let treatyId = "";

  if (!DRY_RUN && leaderA) {
    await log("Submitting create_treaty to Sui...");
    const digest = await execTx(leaderA, (tx) => {
      const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(DEPOSIT)]);
      tx.moveCall({
        target: `${PKG}::covenant::create_treaty`,
        arguments: [
          tx.pure.u8(0),
          tx.pure.vector("u8", new TextEncoder().encode("Non-Aggression Pact: Alpha Fleet & Beta Corp")),
          tx.pure.vector("u8", new TextEncoder().encode("Alpha Fleet")),
          tx.pure.vector("u8", new TextEncoder().encode("Beta Corp")),
          tx.pure.address(addrB),
          tx.pure.vector("u64", [1001, 1002, 1003]),
          tx.pure.u64(DEPOSIT),
          tx.pure.u64(0),
          coin,
          tx.object(CLOCK),
        ],
      });
    });
    await logOk(`Transaction: ${digest.slice(0, 24)}...`);
    const events = await client.queryEvents({ query: { Transaction: digest }, limit: 10 });
    for (const ev of events.data) {
      const json = ev.parsedJson as any;
      if (json?.treaty_id) { treatyId = json.treaty_id; break; }
    }
    await logOk(`Treaty Object: ${treatyId.slice(0, 24)}...`);
  } else {
    treatyId = "0xDEMO_TREATY_OBJECT_ID_PLACEHOLDER";
    await logOk("Treaty proposed successfully (simulated)");
  }

  separator();
  await logPair("Status", `${C.rust}${C.bold}▌ PENDING${C.reset}${C.dim}  — awaiting counterparty signature${C.reset}`);
  await log(`Strikes:    ${strikeBar(0)}     ${C.dim}0 of 3${C.reset}`);
  await log(`Deposit A:  ${depositBar(DEPOSIT, DEPOSIT)}`);

  phaseEnd();
  await sleep(3500);

  // ═══════════════════════════════════════════════════════
  // PHASE 2: SIGN
  // ═══════════════════════════════════════════════════════

  phase(2, "SIGN — Alliance B co-signs the treaty");

  await log(`${C.bone}Beta Corp reviews the terms and commits their own stake.${C.reset}`);
  await log(`${C.bone}Both deposits are now locked in the smart contract.${C.reset}`);
  separator();
  await logPair("Signer", addr(addrB));
  await logPair("Members B", "Pilots #2001, #2002, #2003");
  await logPair("Deposit B", "0.1 SUI");
  separator();

  if (!DRY_RUN && leaderB) {
    await log("Submitting sign_treaty to Sui...");
    const digest = await execTx(leaderB, (tx) => {
      const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(DEPOSIT)]);
      tx.moveCall({
        target: `${PKG}::covenant::sign_treaty`,
        arguments: [
          tx.object(treatyId),
          tx.object(REGISTRY),
          tx.pure.vector("u64", [2001, 2002, 2003]),
          coin,
          tx.object(CLOCK),
        ],
      });
    });
    await logOk(`Transaction: ${digest.slice(0, 24)}...`);
  } else {
    await logOk("Treaty signed successfully (simulated)");
  }

  separator();
  await logPair("Status", `${C.gold}${C.bold}▌ ACTIVE${C.reset}${C.dim}  — treaty is now in force${C.reset}`);
  await log(`Strikes:    ${strikeBar(0)}     ${C.dim}0 of 3${C.reset}`);
  await log(`Deposit A:  ${depositBar(DEPOSIT, DEPOSIT)}`);
  await log(`Deposit B:  ${depositBar(DEPOSIT, DEPOSIT)}`);
  separator();
  await logOk("Cross-alliance kills will now trigger automatic penalties.");
  await log(`${C.dim}The KillMail indexer monitors on-chain events every 30 seconds.${C.reset}`);

  phaseEnd();
  await sleep(3500);

  // ═══════════════════════════════════════════════════════
  // PHASE 3-5: THREE VIOLATIONS
  // ═══════════════════════════════════════════════════════

  const violations = [
    { strike: 1, pct: 20, attacker: 1001, victim: 2001, killmail: 42,
      desc: "Alpha pilot #1001 destroyed Beta pilot #2001 in Sector 7G",
      note: "First incident — 20% penalty applied. Treaty remains active." },
    { strike: 2, pct: 40, attacker: 1002, victim: 2002, killmail: 43,
      desc: "Alpha pilot #1002 ambushed Beta pilot #2002 near Gate Nexus",
      note: "Pattern of aggression — 40% penalty. One strike remaining." },
    { strike: 3, pct: 100, attacker: 1003, victim: 2003, killmail: 44,
      desc: "Alpha pilot #1003 eliminated Beta pilot #2003 in open space",
      note: "" },
  ];

  let depositRemaining = DEPOSIT;

  for (const v of violations) {
    const isTerminal = v.strike === 3;
    const penalty = isTerminal ? depositRemaining : Math.floor(DEPOSIT * v.pct / 100);

    phase(v.strike + 2, `STRIKE ${v.strike}/3 — ${isTerminal ? "TERMINAL VIOLATION" : "VIOLATION DETECTED"}`);

    logViolation(v.desc);

    await logPair("KillMail ID", `#${v.killmail}`);
    await logPair("Attacker", `Character ${v.attacker} ${C.dim}(Alpha Fleet)${C.reset}`);
    await logPair("Victim", `Character ${v.victim} ${C.dim}(Beta Corp)${C.reset}`);
    await logPair("Penalty Tier", `${C.orange}${C.bold}${v.pct}%${C.reset} of original deposit`);
    await logPair("Amount Forfeited", `${C.orange}${(penalty / 1e9).toFixed(2)} SUI${C.reset} → transferred to Beta Corp`);
    separator();

    if (!DRY_RUN && oracle) {
      await log("Oracle submitting report_violation...");
      const digest = await execTx(oracle, (tx) => {
        tx.moveCall({
          target: `${PKG}::covenant::report_violation`,
          arguments: [
            tx.object(ORACLE_CAP),
            tx.object(treatyId),
            tx.object(REGISTRY),
            tx.pure.u64(v.attacker),
            tx.pure.u64(v.victim),
            tx.pure.u64(v.killmail),
            tx.object(CLOCK),
          ],
        });
      });
      await logOk(`Transaction: ${digest.slice(0, 24)}...`);
    } else {
      await logOk("Violation reported & penalty applied (simulated)");
    }

    depositRemaining -= penalty;
    if (depositRemaining < 0) depositRemaining = 0;

    separator();
    await log(`Strikes:    ${strikeBar(v.strike)}     ${v.strike} of 3`);
    await log(`Deposit A:  ${depositBar(depositRemaining, DEPOSIT)}`);

    if (isTerminal) {
      separator();
      await logWarn(`${C.orange}${C.bold}TREATY TERMINATED — three strikes, full forfeiture${C.reset}`);
      await logPair("Total Compensation", `${C.orange}${C.bold}${(DEPOSIT / 1e9).toFixed(2)} SUI${C.reset} to Beta Corp`);
      await logPair("B Deposit Returned", `${(DEPOSIT / 1e9).toFixed(2)} SUI (innocent party protected)`);
      await logPair("Final Status", `${C.orange}${C.bold}▌ VIOLATED${C.reset}`);
    } else {
      await log(`${C.dim}${v.note}${C.reset}`);
      await logPair("Status", `${C.gold}▌ ACTIVE${C.reset}${C.dim}  — treaty continues${C.reset}`);
    }

    phaseEnd();
    await sleep(4000);
  }

  // ═══════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════

  banner("DEMO COMPLETE — Treaty Lifecycle Summary");

  console.log(`${C.bone}  ┌──────────────────────────────────────────────────────────────────┐${C.reset}`);
  console.log(`${C.bone}  │  PROPOSE → SIGN → STRIKE 1 → STRIKE 2 → STRIKE 3 → TERMINATED  │${C.reset}`);
  console.log(`${C.bone}  │            │        20%        40%        100%                   │${C.reset}`);
  console.log(`${C.bone}  │          ACTIVE    ACTIVE     ACTIVE    VIOLATED                 │${C.reset}`);
  console.log(`${C.bone}  └──────────────────────────────────────────────────────────────────┘${C.reset}`);
  console.log();
  console.log(`${C.dim}  Alpha Fleet lost their full 0.10 SUI deposit for repeated aggression.${C.reset}`);
  console.log(`${C.dim}  Beta Corp received 0.10 SUI compensation — no arbitrator, no vote.${C.reset}`);
  console.log(`${C.dim}  Every violation recorded on-chain as an immutable ViolationRecord.${C.reset}`);
  console.log(`${C.dim}  The blockchain was the judge.${C.reset}`);
  console.log();
  console.log(`${C.gold}  ════════════════════════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.gold}${C.bold}  Covenant — Self-Executing Treaties for EVE Frontier${C.reset}`);
  console.log(`${C.gold}  3 modules: covenant.move │ treaty_registry.move │ gate_enforcer.move${C.reset}`);
  console.log(`${C.gold}  Built for the 2026 EVE Frontier × Sui Hackathon${C.reset}`);
  console.log(`${C.gold}  ════════════════════════════════════════════════════════════════════${C.reset}`);
  console.log();
}

demo().catch((e) => {
  console.error(`\n${C.rust}  Fatal: ${e.message}${C.reset}`);
  process.exit(1);
});
