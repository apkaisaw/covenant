/**
 * Covenant — Interactive Treaty Creation CLI
 *
 * One input (counterparty address) + one confirmation (y/n) = treaty on-chain.
 *
 * Usage:
 *   npx tsx create.ts
 */

import "dotenv/config";
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import * as readline from "readline";

// ═══════════════════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════════════════

const PKG = process.env.PACKAGE_ID || "0xdc38becdb1221fdf43444a50b2950bebb3ab47285df8ee756553973995e55670";
const CLOCK = "0x6";
const client = new SuiClient({ url: "https://fullnode.testnet.sui.io:443" });

// Defaults
const ALLIANCE_A_NAME = "Alpha Fleet";
const ALLIANCE_B_NAME = "Beta Corp";
const MEMBERS_A = [1001, 1002, 1003];
const DEPOSIT_MIST = 100_000_000; // 0.1 SUI
const TREATY_TYPE = 0; // NAP
const DESCRIPTION = "Non-Aggression Pact: Alpha Fleet & Beta Corp";

// ═══════════════════════════════════════════════════════════════════════════
// Visual
// ═══════════════════════════════════════════════════════════════════════════

const W = 72;

const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  gold:   "\x1b[38;2;184;148;62m",
  bone:   "\x1b[38;2;232;220;200m",
  orange: "\x1b[38;2;232;93;38m",
  rust:   "\x1b[38;2;139;37;0m",
  green:  "\x1b[38;2;163;190;140m",
  cyan:   "\x1b[38;2;136;192;208m",
};

function banner(title: string) {
  const line = "═".repeat(W);
  console.log();
  console.log(`${C.gold}  ╔${line}╗${C.reset}`);
  console.log(`${C.gold}  ║${C.bold}${C.bone}  ${title.padEnd(W - 2)}${C.reset}${C.gold}║${C.reset}`);
  console.log(`${C.gold}  ╚${line}╝${C.reset}`);
  console.log();
}

function section(title: string) {
  const remaining = Math.max(0, W - title.length - 6);
  console.log(`${C.gold}  ┌─── ${C.bold}${title}${C.reset}${C.gold} ${"─".repeat(remaining)}┐${C.reset}`);
}

function sectionEnd() {
  console.log(`${C.gold}  └${"─".repeat(W)}┘${C.reset}`);
  console.log();
}

function separator() {
  console.log(`${C.gold}  │${C.dim}  ${"· ".repeat(Math.floor(W / 2 - 1))}${C.reset}${C.gold}│${C.reset}`);
}

function line(msg: string) {
  console.log(`${C.gold}  │${C.reset}  ${msg}`);
}

function pair(label: string, value: string) {
  console.log(`${C.gold}  │${C.reset}  ${C.dim}${label.padEnd(22)}${C.reset} ${value}`);
}

function ok(msg: string) {
  console.log(`${C.gold}  │${C.reset}  ${C.green}✓${C.reset} ${msg}`);
}

function spinner(msg: string): () => void {
  const frames = ["◐", "◓", "◑", "◒"];
  let i = 0;
  const interval = setInterval(() => {
    process.stdout.write(`\r${C.gold}  │${C.reset}  ${C.cyan}${frames[i % 4]}${C.reset} ${msg}`);
    i++;
  }, 250);
  return () => {
    clearInterval(interval);
    process.stdout.write("\r" + " ".repeat(W + 6) + "\r");
  };
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function ask(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(`${C.gold}  │${C.reset}  ${C.cyan}${C.bold}${prompt}${C.reset} `, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function addr(a: string): string {
  if (a.length < 20) return `${C.gold}${a}${C.reset}`;
  return `${C.gold}${a.slice(0, 10)}...${a.slice(-8)}${C.reset}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Wallet
// ═══════════════════════════════════════════════════════════════════════════

function loadKeypair(): Ed25519Keypair {
  const raw = process.env.LEADER_A_KEY || process.env.ORACLE_KEY;
  if (!raw) {
    console.error(`${C.rust}  Missing LEADER_A_KEY in .env${C.reset}`);
    process.exit(1);
  }
  try {
    const { schema, secretKey } = decodeSuiPrivateKey(raw);
    if (schema !== "ED25519") throw new Error("not ed25519");
    return Ed25519Keypair.fromSecretKey(secretKey);
  } catch {
    return Ed25519Keypair.fromSecretKey(Uint8Array.from(Buffer.from(raw, "base64")));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  banner("COVENANT — Create a New Treaty");

  console.log(`${C.bone}  Propose a Non-Aggression Pact on Sui Testnet.${C.reset}`);
  console.log(`${C.bone}  Your counterparty will sign it in the browser.${C.reset}`);
  console.log();

  // Load wallet
  const keypair = loadKeypair();
  const myAddr = keypair.getPublicKey().toSuiAddress();

  section("YOUR WALLET");
  pair("Address", addr(myAddr));

  const balance = await client.getBalance({ owner: myAddr });
  const suiBalance = (Number(balance.totalBalance) / 1e9).toFixed(2);
  pair("Balance", `${suiBalance} SUI`);
  pair("Network", "Sui Testnet");
  sectionEnd();

  // Ask for counterparty address
  section("COUNTERPARTY");
  line(`${C.dim}Paste the Sui address of the alliance leader you want to${C.reset}`);
  line(`${C.dim}propose a treaty with. They will sign it in the browser.${C.reset}`);
  separator();

  const counterparty = await ask("Leader B address: ");

  if (!counterparty.startsWith("0x") || counterparty.length < 40) {
    line(`${C.rust}Invalid address. Must start with 0x.${C.reset}`);
    sectionEnd();
    process.exit(1);
  }

  pair("Counterparty", addr(counterparty));
  sectionEnd();

  await sleep(500);

  // Show treaty summary
  section("TREATY SUMMARY");
  line(`${C.bone}Review the treaty terms before submitting.${C.reset}`);
  separator();
  pair("Type", "Non-Aggression Pact (NAP)");
  pair("Description", DESCRIPTION);
  pair("Alliance A", `${C.bone}${C.bold}${ALLIANCE_A_NAME}${C.reset}`);
  pair("Alliance B", `${C.bone}${C.bold}${ALLIANCE_B_NAME}${C.reset}`);
  pair("Leader A (you)", addr(myAddr));
  pair("Leader B (them)", addr(counterparty));
  pair("Members A", `Pilots #${MEMBERS_A.join(", #")}`);
  pair("Deposit", `${(DEPOSIT_MIST / 1e9).toFixed(1)} SUI per side`);
  pair("Duration", "Permanent (no expiry)");
  pair("Penalty Model", "Graduated: 20% → 40% → 100%");
  separator();

  const confirm = await ask("Submit treaty to Sui? (y/n): ");

  if (confirm.toLowerCase() !== "y") {
    line(`${C.dim}Cancelled.${C.reset}`);
    sectionEnd();
    process.exit(0);
  }
  sectionEnd();

  // Submit transaction
  section("SUBMITTING");

  const stop = spinner("Sending create_treaty to Sui Testnet...");

  try {
    const tx = new Transaction();
    const [depositCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(DEPOSIT_MIST)]);
    tx.moveCall({
      target: `${PKG}::covenant::create_treaty`,
      arguments: [
        tx.pure.u8(TREATY_TYPE),
        tx.pure.vector("u8", new TextEncoder().encode(DESCRIPTION)),
        tx.pure.vector("u8", new TextEncoder().encode(ALLIANCE_A_NAME)),
        tx.pure.vector("u8", new TextEncoder().encode(ALLIANCE_B_NAME)),
        tx.pure.address(counterparty),
        tx.pure.vector("u64", MEMBERS_A),
        tx.pure.u64(DEPOSIT_MIST),
        tx.pure.u64(0),
        depositCoin,
        tx.object(CLOCK),
      ],
    });

    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showEffects: true },
    });

    stop();

    if (result.effects?.status?.status !== "success") {
      throw new Error(JSON.stringify(result.effects?.status));
    }

    ok(`Transaction: ${result.digest.slice(0, 28)}...`);

    // Find treaty ID from events
    const events = await client.queryEvents({ query: { Transaction: result.digest }, limit: 10 });
    let treatyId = "";
    for (const ev of events.data) {
      const json = ev.parsedJson as any;
      if (json?.treaty_id) { treatyId = json.treaty_id; break; }
    }

    if (treatyId) {
      ok(`Treaty Object: ${treatyId.slice(0, 28)}...`);
    }

    separator();
    pair("Status", `${C.rust}${C.bold}▌ PENDING${C.reset}${C.dim}  — awaiting counterparty signature${C.reset}`);
    line(`Strikes:    ${C.dim}○${C.reset}  ${C.dim}○${C.reset}  ${C.dim}○${C.reset}     ${C.dim}0 of 3${C.reset}`);
    line(`Deposit A:  ${C.gold}${"━".repeat(20)}${C.reset}  ${(DEPOSIT_MIST / 1e9).toFixed(2)} SUI (100%)`);

    sectionEnd();

    // Next steps
    section("NEXT STEPS");
    line(`${C.bone}${C.bold}1.${C.reset} Open ${C.cyan}https://covenant-eve.vercel.app${C.reset}`);
    line(`${C.bone}${C.bold}2.${C.reset} Connect wallet ${addr(counterparty)}`);
    line(`${C.bone}${C.bold}3.${C.reset} Click the treaty → ${C.green}SIGN TREATY${C.reset}`);
    line(`${C.bone}${C.bold}4.${C.reset} Enter members: ${C.dim}2001, 2002, 2003${C.reset}`);
    line(`${C.bone}${C.bold}5.${C.reset} Confirm in wallet → treaty becomes ${C.gold}${C.bold}ACTIVE${C.reset}`);
    sectionEnd();

  } catch (e: any) {
    stop();
    line(`${C.rust}${C.bold}Error: ${e.message}${C.reset}`);
    sectionEnd();
    process.exit(1);
  }
}

main();
