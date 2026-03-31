/**
 * Covenant Demo — Full Treaty Lifecycle
 *
 * Walks through the entire flow in ~90 seconds:
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

// ═══════════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════════

const PKG = process.env.PACKAGE_ID || "0xdc38becdb1221fdf43444a50b2950bebb3ab47285df8ee756553973995e55670";
const ORACLE_CAP = process.env.ORACLE_CAP_ID || "0xfa7bb70ef18442a260bfa177738ee57c3c14b6338f1a29c25a564b778bb798d0";
const REGISTRY = process.env.TREATY_REGISTRY_ID || "0x99b678e3952d2334ed1fc58ecbdd183e5e396fc181e5fcd690de35e9a3a414a0";
const CLOCK = "0x6";
const DRY_RUN = process.argv.includes("--dry-run");

const client = new SuiClient({ url: "https://fullnode.testnet.sui.io:443" });

// ═══════════════════════════════════════════════════════════════════
// ASCII Visual Helpers
// ═══════════════════════════════════════════════════════════════════

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
  const line = "═".repeat(58);
  console.log();
  console.log(`${C.gold}  ╔${line}╗${C.reset}`);
  console.log(`${C.gold}  ║${C.bold}${C.bone}  ${title.padEnd(56)}${C.reset}${C.gold}║${C.reset}`);
  console.log(`${C.gold}  ╚${line}╝${C.reset}`);
  console.log();
}

function phase(num: number, title: string) {
  console.log(`${C.gold}  ┌─── ${C.bold}PHASE ${num}${C.reset}${C.gold} ─── ${title} ${"─".repeat(Math.max(0, 38 - title.length))}┐${C.reset}`);
}

function phaseEnd() {
  console.log(`${C.gold}  └${"─".repeat(58)}┘${C.reset}`);
  console.log();
}

function log(msg: string) {
  console.log(`${C.gold}  │${C.reset}  ${msg}`);
}

function logPair(label: string, value: string) {
  console.log(`${C.gold}  │${C.reset}  ${C.dim}${label.padEnd(20)}${C.reset} ${value}`);
}

function logOk(msg: string) {
  console.log(`${C.gold}  │${C.reset}  ${C.green}✓${C.reset} ${msg}`);
}

function logWarn(msg: string) {
  console.log(`${C.gold}  │${C.reset}  ${C.orange}⚠${C.reset} ${msg}`);
}

function logViolation(msg: string) {
  console.log(`${C.gold}  │${C.reset}  ${C.orange}${C.bold}▓▓▓${C.reset} ${C.orange}${msg}${C.reset}`);
}

function strikeBar(count: number): string {
  const dots = [0, 1, 2].map(i =>
    i < count ? `${C.orange}●${C.reset}` : `${C.dim}○${C.reset}`
  ).join(" ");
  return dots;
}

function depositBar(remaining: number, total: number): string {
  const pct = remaining / total;
  const filled = Math.round(pct * 10);
  const bar = `${C.gold}${"━".repeat(filled)}${C.dim}${"·".repeat(10 - filled)}${C.reset}`;
  return `${bar} ${(remaining / 1e9).toFixed(2)} SUI`;
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function addr(a: string): string {
  return `${C.gold}${a.slice(0, 8)}...${a.slice(-6)}${C.reset}`;
}

// ═══════════════════════════════════════════════════════════════════
// Wallet Setup
// ═══════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════
// Transaction Helpers
// ═══════════════════════════════════════════════════════════════════

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

function findCreatedObject(result: any, typeSuffix: string): string | null {
  // We'll extract from effects
  return null; // Will use event query instead
}

// ═══════════════════════════════════════════════════════════════════
// Demo Flow
// ═══════════════════════════════════════════════════════════════════

async function demo() {
  banner("COVENANT — Self-Executing Treaties for EVE Frontier");

  console.log(`${C.dim}  Every war in EVE starts the same way: someone breaks a promise.${C.reset}`);
  console.log(`${C.dim}  Covenant makes betrayal expensive.${C.reset}`);
  console.log();

  if (DRY_RUN) {
    console.log(`${C.rust}  ┌──────────────────────────────────────┐${C.reset}`);
    console.log(`${C.rust}  │  DRY RUN — no transactions submitted │${C.reset}`);
    console.log(`${C.rust}  └──────────────────────────────────────┘${C.reset}`);
    console.log();
  }

  logPair("Package", PKG.slice(0, 20) + "...");
  logPair("Network", "Sui Testnet");
  logPair("Mode", DRY_RUN ? "Simulated" : "Live");
  console.log();

  // Load keys
  const leaderA = loadKey("LEADER_A_KEY");
  const leaderB = loadKey("LEADER_B_KEY");
  const oracle = loadKey("ORACLE_KEY");

  if (!DRY_RUN && (!leaderA || !leaderB || !oracle)) {
    console.error("  Missing keys. Set LEADER_A_KEY, LEADER_B_KEY, ORACLE_KEY in .env");
    console.error("  Or run with --dry-run for simulated output.");
    process.exit(1);
  }

  const addrA = leaderA?.getPublicKey().toSuiAddress() || "0xAAAA...demo";
  const addrB = leaderB?.getPublicKey().toSuiAddress() || "0xBBBB...demo";

  await sleep(1500);

  // ═════════════════════════════════════════════════════
  // PHASE 1: PROPOSE
  // ═════════════════════════════════════════════════════

  phase(1, "PROPOSE — Alpha Fleet drafts a treaty");

  logPair("Alliance A", `${C.bone}Alpha Fleet${C.reset}`);
  logPair("Alliance B", `${C.bone}Beta Corp${C.reset}`);
  logPair("Leader A", addr(addrA));
  logPair("Leader B", addr(addrB));
  logPair("Treaty Type", "Non-Aggression Pact");
  logPair("Deposit", "0.1 SUI per side");
  logPair("Members A", "[1001, 1002, 1003]");
  log("");

  const DEPOSIT = 100_000_000; // 0.1 SUI
  let treatyId = "";

  if (!DRY_RUN && leaderA) {
    log("Submitting create_treaty...");
    const digest = await execTx(leaderA, (tx) => {
      const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(DEPOSIT)]);
      tx.moveCall({
        target: `${PKG}::covenant::create_treaty`,
        arguments: [
          tx.pure.u8(0), // NAP
          tx.pure.vector("u8", new TextEncoder().encode("Non-Aggression Pact: Alpha Fleet & Beta Corp")),
          tx.pure.vector("u8", new TextEncoder().encode("Alpha Fleet")),
          tx.pure.vector("u8", new TextEncoder().encode("Beta Corp")),
          tx.pure.address(addrB),
          tx.pure.vector("u64", [1001, 1002, 1003]),
          tx.pure.u64(DEPOSIT),
          tx.pure.u64(0), // permanent
          coin,
          tx.object(CLOCK),
        ],
      });
    });
    logOk(`TX: ${digest.slice(0, 20)}...`);

    // Find treaty ID from events
    const events = await client.queryEvents({
      query: { Transaction: digest },
      limit: 10,
    });
    for (const ev of events.data) {
      const json = ev.parsedJson as any;
      if (json?.treaty_id) {
        treatyId = json.treaty_id;
        break;
      }
    }
    logOk(`Treaty: ${treatyId.slice(0, 20)}...`);
  } else {
    treatyId = "0xDEMO_TREATY_ID";
    logOk("Treaty proposed (simulated)");
  }

  logPair("Status", `${C.rust}PENDING${C.reset}`);
  log(`Strike progress:   ${strikeBar(0)}  0/3`);
  log(`Deposit A:         ${depositBar(DEPOSIT, DEPOSIT)}`);

  phaseEnd();
  await sleep(2000);

  // ═════════════════════════════════════════════════════
  // PHASE 2: SIGN
  // ═════════════════════════════════════════════════════

  phase(2, "SIGN — Beta Corp co-signs the treaty");

  logPair("Signer", addr(addrB));
  logPair("Members B", "[2001, 2002, 2003]");
  logPair("Deposit B", "0.1 SUI");
  log("");

  if (!DRY_RUN && leaderB) {
    log("Submitting sign_treaty...");
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
    logOk(`TX: ${digest.slice(0, 20)}...`);
  } else {
    logOk("Treaty signed (simulated)");
  }

  logPair("Status", `${C.gold}${C.bold}ACTIVE${C.reset}`);
  log(`Strike progress:   ${strikeBar(0)}  0/3`);
  log(`Deposit A:         ${depositBar(DEPOSIT, DEPOSIT)}`);
  log(`Deposit B:         ${depositBar(DEPOSIT, DEPOSIT)}`);
  logOk("Treaty is now in force. Cross-alliance kills trigger penalties.");

  phaseEnd();
  await sleep(2000);

  // ═════════════════════════════════════════════════════
  // PHASE 3-5: THREE VIOLATIONS (graduated penalty)
  // ═════════════════════════════════════════════════════

  const violations = [
    { strike: 1, pct: 20, attacker: 1001, victim: 2001, killmail: 42,
      desc: "Alpha pilot #1001 kills Beta pilot #2001" },
    { strike: 2, pct: 40, attacker: 1002, victim: 2002, killmail: 43,
      desc: "Alpha pilot #1002 kills Beta pilot #2002" },
    { strike: 3, pct: 100, attacker: 1003, victim: 2003, killmail: 44,
      desc: "Alpha pilot #1003 kills Beta pilot #2003" },
  ];

  let depositRemaining = DEPOSIT;

  for (const v of violations) {
    const isTerminal = v.strike === 3;
    const penalty = isTerminal ? depositRemaining : Math.floor(DEPOSIT * v.pct / 100);

    phase(v.strike + 2, `STRIKE ${v.strike} — ${isTerminal ? "TERMINAL VIOLATION" : "VIOLATION DETECTED"}`);

    logViolation(v.desc);
    log("");
    logPair("KillMail ID", `#${v.killmail}`);
    logPair("Attacker", `Character ${v.attacker} (Alpha Fleet)`);
    logPair("Victim", `Character ${v.victim} (Beta Corp)`);
    logPair("Penalty", `${v.pct}% of deposit = ${(penalty / 1e9).toFixed(2)} SUI`);
    log("");

    if (!DRY_RUN && oracle) {
      log("Oracle submitting report_violation...");
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
      logOk(`TX: ${digest.slice(0, 20)}...`);
    } else {
      logOk("Violation reported (simulated)");
    }

    depositRemaining -= penalty;
    if (depositRemaining < 0) depositRemaining = 0;

    log("");
    log(`Strike progress:   ${strikeBar(v.strike)}  ${v.strike}/3`);
    log(`Deposit A:         ${depositBar(depositRemaining, DEPOSIT)}`);

    if (isTerminal) {
      log("");
      logWarn(`${C.orange}${C.bold}TREATY TERMINATED — Full deposit forfeited${C.reset}`);
      logPair("Compensation to B", `${(DEPOSIT / 1e9).toFixed(2)} SUI total`);
      logPair("Final Status", `${C.orange}${C.bold}VIOLATED${C.reset}`);
    } else {
      logPair("Status", `${C.gold}ACTIVE${C.reset} (treaty continues)`);
      logPair("Remaining deposit", `${(depositRemaining / 1e9).toFixed(2)} SUI`);
    }

    phaseEnd();
    await sleep(2500);
  }

  // ═════════════════════════════════════════════════════
  // SUMMARY
  // ═════════════════════════════════════════════════════

  banner("DEMO COMPLETE");

  console.log(`${C.bone}  Treaty lifecycle:  PROPOSE → SIGN → VIOLATION ×3 → TERMINATED${C.reset}`);
  console.log(`${C.bone}  Graduated penalty: 20% → 40% → 100% (three-strike system)${C.reset}`);
  console.log();
  console.log(`${C.dim}  Alpha Fleet lost their full deposit for repeated aggression.${C.reset}`);
  console.log(`${C.dim}  Beta Corp was compensated automatically — no arbitrator needed.${C.reset}`);
  console.log(`${C.dim}  The blockchain was the judge.${C.reset}`);
  console.log();
  console.log(`${C.gold}  ──────────────────────────────────────────────────────────${C.reset}`);
  console.log(`${C.gold}  Covenant — Self-Executing Treaties for EVE Frontier${C.reset}`);
  console.log(`${C.gold}  Built for the 2026 EVE Frontier × Sui Hackathon${C.reset}`);
  console.log(`${C.gold}  ──────────────────────────────────────────────────────────${C.reset}`);
  console.log();
}

demo().catch((e) => {
  console.error(`\n${C.rust}  Fatal: ${e.message}${C.reset}`);
  process.exit(1);
});
