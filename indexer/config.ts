/**
 * Indexer configuration — loaded from .env
 */

import "dotenv/config";
import { SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`Missing required env var: ${name}`);
    console.error(`Copy .env.example to .env and fill in the values.`);
    process.exit(1);
  }
  return val;
}

export const COVENANT_PACKAGE_ID = requireEnv("COVENANT_PACKAGE_ID");
export const ORACLE_CAP_ID = requireEnv("ORACLE_CAP_ID");
export const WORLD_PACKAGE_ID = requireEnv("WORLD_PACKAGE_ID");
export const SUI_RPC_URL =
  process.env.SUI_RPC_URL || "https://fullnode.testnet.sui.io:443";
export const SUI_GRAPHQL_URL =
  process.env.SUI_GRAPHQL_URL || "https://graphql.testnet.sui.io/graphql";
export const POLL_INTERVAL = Number(process.env.POLL_INTERVAL || "30") * 1000;
export const CLOCK = "0x6";

export const DRY_RUN = process.argv.includes("--dry-run");

export const KILLMAIL_EVENT_TYPE = `${WORLD_PACKAGE_ID}::killmail::KillmailCreatedEvent`;

export const client = new SuiClient({ url: SUI_RPC_URL });

export function loadKeypair(): Ed25519Keypair | null {
  if (DRY_RUN) return null;
  const raw = requireEnv("ORACLE_PRIVATE_KEY");
  try {
    const { schema, secretKey } = decodeSuiPrivateKey(raw);
    if (schema !== "ED25519") throw new Error(`Unsupported key schema: ${schema}`);
    return Ed25519Keypair.fromSecretKey(secretKey);
  } catch {
    return Ed25519Keypair.fromSecretKey(
      Uint8Array.from(Buffer.from(raw, "base64"))
    );
  }
}

export function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
