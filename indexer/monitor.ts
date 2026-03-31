/**
 * Covenant KillMail Monitor
 *
 * Polls KillmailCreatedEvent from Sui GraphQL, matches attacker/victim
 * against active treaty member lists, and submits report_violation()
 * transactions when a treaty breach is detected.
 *
 * Usage:
 *   npx tsx monitor.ts            # live mode (submits transactions)
 *   npx tsx monitor.ts --dry-run  # dry-run mode (log only, no tx)
 */

import "dotenv/config";
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const COVENANT_PACKAGE_ID = requireEnv("COVENANT_PACKAGE_ID");
const ORACLE_CAP_ID = requireEnv("ORACLE_CAP_ID");
const WORLD_PACKAGE_ID = requireEnv("WORLD_PACKAGE_ID");
const SUI_RPC_URL =
  process.env.SUI_RPC_URL || "https://fullnode.testnet.sui.io:443";
const SUI_GRAPHQL_URL =
  process.env.SUI_GRAPHQL_URL || "https://graphql.testnet.sui.io/graphql";
const POLL_INTERVAL = Number(process.env.POLL_INTERVAL || "30") * 1000;
const CLOCK = "0x6";

const DRY_RUN = process.argv.includes("--dry-run");

const KILLMAIL_EVENT_TYPE = `${WORLD_PACKAGE_ID}::killmail::KillmailCreatedEvent`;
const TREATY_TYPE = `${COVENANT_PACKAGE_ID}::covenant::Treaty`;

// ---------------------------------------------------------------------------
// Sui client + keypair
// ---------------------------------------------------------------------------

const client = new SuiClient({ url: SUI_RPC_URL });

let keypair: Ed25519Keypair | null = null;
if (!DRY_RUN) {
  const raw = requireEnv("ORACLE_PRIVATE_KEY");
  try {
    const { schema, secretKey } = decodeSuiPrivateKey(raw);
    if (schema !== "ED25519") throw new Error(`Unsupported key schema: ${schema}`);
    keypair = Ed25519Keypair.fromSecretKey(secretKey);
  } catch {
    // Fallback: try as raw base64
    keypair = Ed25519Keypair.fromSecretKey(
      Uint8Array.from(Buffer.from(raw, "base64"))
    );
  }
  log(`Oracle address: ${keypair.getPublicKey().toSuiAddress()}`);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KillMailEvent {
  killerId: number;
  victimId: number;
  killmailId: number;
  killTimestamp: number;
  solarSystemId: number;
}

interface TreatyInfo {
  objectId: string;
  status: number;
  allianceALeader: string;
  allianceBLeader: string;
  allianceAMembers: Set<number>;
  allianceBMembers: Set<number>;
}

// ---------------------------------------------------------------------------
// GraphQL: fetch KillmailCreatedEvent
// ---------------------------------------------------------------------------

const EVENTS_QUERY = `
query FetchEvents($eventType: String!, $first: Int!, $after: String) {
  events(
    filter: { type: $eventType }
    first: $first
    after: $after
  ) {
    nodes {
      contents { json }
      timestamp
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}`;

async function fetchKillMailEvents(
  afterCursor: string | null
): Promise<{ events: KillMailEvent[]; cursor: string | null }> {
  const allEvents: KillMailEvent[] = [];
  let cursor = afterCursor;

  for (let page = 0; page < 10; page++) {
    const variables: Record<string, unknown> = {
      eventType: KILLMAIL_EVENT_TYPE,
      first: 50,
    };
    if (cursor) variables.after = cursor;

    const res = await fetch(SUI_GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: EVENTS_QUERY, variables }),
    });

    const body = await res.json() as any;
    const eventsData = body?.data?.events;
    if (!eventsData) {
      log(`GraphQL error: ${JSON.stringify(body?.errors ?? body)}`);
      break;
    }

    for (const node of eventsData.nodes ?? []) {
      const json = node.contents?.json;
      if (!json) continue;

      allEvents.push({
        killerId: extractItemId(json.killer_id),
        victimId: extractItemId(json.victim_id),
        killmailId: extractItemId(json.key),
        killTimestamp: Number(json.kill_timestamp ?? 0),
        solarSystemId: extractItemId(json.solar_system_id),
      });
    }

    const pageInfo = eventsData.pageInfo;
    cursor = pageInfo?.endCursor ?? null;
    if (!pageInfo?.hasNextPage) break;
  }

  return { events: allEvents, cursor };
}

function extractItemId(obj: unknown): number {
  if (typeof obj === "number") return obj;
  if (typeof obj === "string") return Number(obj);
  if (obj && typeof obj === "object") {
    const id = (obj as Record<string, unknown>).item_id;
    return Number(id ?? 0);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Fetch active treaties from chain
// ---------------------------------------------------------------------------

async function fetchActiveTreaties(): Promise<TreatyInfo[]> {
  const treaties: TreatyInfo[] = [];
  let cursor: string | undefined;

  // Query all Treaty objects owned by the package (shared objects)
  do {
    const res = await client.queryEvents({
      query: {
        MoveEventType: `${COVENANT_PACKAGE_ID}::covenant::TreatySigned`,
      },
      limit: 50,
      cursor: cursor as any,
    });

    for (const event of res.data) {
      const json = event.parsedJson as any;
      if (!json?.treaty_id) continue;

      try {
        const treaty = await fetchTreatyObject(json.treaty_id);
        if (treaty && treaty.status === 1) {
          treaties.push(treaty);
        }
      } catch (e: any) {
        log(`Failed to fetch treaty ${json.treaty_id}: ${e.message}`);
      }
    }

    cursor = res.hasNextPage ? (res.nextCursor as any) : undefined;
  } while (cursor);

  return treaties;
}

async function fetchTreatyObject(
  objectId: string
): Promise<TreatyInfo | null> {
  const res = await client.getObject({
    id: objectId,
    options: { showContent: true },
  });

  const content = res.data?.content;
  if (content?.dataType !== "moveObject") return null;

  const fields = content.fields as any;
  if (!fields) return null;

  // The member tables are Table objects -- we can't directly read their
  // contents via getObject. Instead, use getDynamicFields to enumerate.
  const membersA = await readTableMembers(fields.alliance_a_members?.fields?.id?.id);
  const membersB = await readTableMembers(fields.alliance_b_members?.fields?.id?.id);

  return {
    objectId,
    status: Number(fields.status),
    allianceALeader: fields.alliance_a_leader,
    allianceBLeader: fields.alliance_b_leader,
    allianceAMembers: membersA,
    allianceBMembers: membersB,
  };
}

async function readTableMembers(tableId: string | undefined): Promise<Set<number>> {
  const members = new Set<number>();
  if (!tableId) return members;

  let cursor: string | undefined;
  do {
    const res = await client.getDynamicFields({
      parentId: tableId,
      limit: 50,
      cursor,
    });

    for (const field of res.data) {
      // Table<u64, bool> -- the key is the character ID
      const key = Number(field.name?.value ?? 0);
      if (key > 0) members.add(key);
    }

    cursor = res.hasNextPage ? (res.nextCursor as string) : undefined;
  } while (cursor);

  return members;
}

// ---------------------------------------------------------------------------
// Match killmails against treaties
// ---------------------------------------------------------------------------

interface ViolationMatch {
  treaty: TreatyInfo;
  attackerCharacterId: number;
  victimCharacterId: number;
  killmailId: number;
}

function matchViolations(
  killmails: KillMailEvent[],
  treaties: TreatyInfo[]
): ViolationMatch[] {
  const matches: ViolationMatch[] = [];

  for (const km of killmails) {
    for (const treaty of treaties) {
      const attackerInA = treaty.allianceAMembers.has(km.killerId);
      const attackerInB = treaty.allianceBMembers.has(km.killerId);
      const victimInA = treaty.allianceAMembers.has(km.victimId);
      const victimInB = treaty.allianceBMembers.has(km.victimId);

      const isCrossAllianceKill =
        (attackerInA && victimInB) || (attackerInB && victimInA);

      if (isCrossAllianceKill) {
        matches.push({
          treaty,
          attackerCharacterId: km.killerId,
          victimCharacterId: km.victimId,
          killmailId: km.killmailId,
        });
      }
    }
  }

  return matches;
}

// ---------------------------------------------------------------------------
// Submit report_violation transaction
// ---------------------------------------------------------------------------

async function submitViolation(match: ViolationMatch): Promise<string | null> {
  if (!keypair) return null;

  const tx = new Transaction();
  tx.moveCall({
    target: `${COVENANT_PACKAGE_ID}::covenant::report_violation`,
    arguments: [
      tx.object(ORACLE_CAP_ID),
      tx.object(match.treaty.objectId),
      tx.pure.u64(match.attackerCharacterId),
      tx.pure.u64(match.victimCharacterId),
      tx.pure.u64(match.killmailId),
      tx.object(CLOCK),
    ],
  });

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });

  const status = result.effects?.status?.status;
  if (status !== "success") {
    log(`TX failed: ${JSON.stringify(result.effects?.status)}`);
    return null;
  }

  return result.digest;
}

// ---------------------------------------------------------------------------
// Main polling loop
// ---------------------------------------------------------------------------

async function main() {
  log("=== Covenant KillMail Monitor ===");
  log(`Mode: ${DRY_RUN ? "DRY-RUN (no transactions)" : "LIVE"}`);
  log(`Package: ${COVENANT_PACKAGE_ID}`);
  log(`KillMail event: ${KILLMAIL_EVENT_TYPE}`);
  log(`Poll interval: ${POLL_INTERVAL / 1000}s`);
  log("");

  let eventCursor: string | null = null;
  let treatyCache: TreatyInfo[] = [];
  let treatyCacheAge = 0;
  const TREATY_CACHE_TTL = 5 * 60 * 1000; // refresh every 5 min

  // Main loop
  while (true) {
    try {
      // 1. Refresh treaty cache if stale
      if (Date.now() - treatyCacheAge > TREATY_CACHE_TTL) {
        log("Refreshing active treaties...");
        treatyCache = await fetchActiveTreaties();
        treatyCacheAge = Date.now();
        log(`Found ${treatyCache.length} active treaty(s)`);
        for (const t of treatyCache) {
          log(
            `  Treaty ${t.objectId.slice(0, 16)}... | ` +
            `A: ${t.allianceAMembers.size} members | ` +
            `B: ${t.allianceBMembers.size} members`
          );
        }
      }

      // 2. Poll new killmail events
      const { events, cursor } = await fetchKillMailEvents(eventCursor);
      if (cursor) eventCursor = cursor;

      if (events.length > 0) {
        log(`Fetched ${events.length} new killmail(s)`);
      }

      // 3. Match against active treaties
      if (events.length > 0 && treatyCache.length > 0) {
        const violations = matchViolations(events, treatyCache);

        for (const v of violations) {
          log(
            `VIOLATION DETECTED! ` +
            `Attacker ${v.attackerCharacterId} killed ${v.victimCharacterId} ` +
            `(killmail #${v.killmailId}) ` +
            `| Treaty ${v.treaty.objectId.slice(0, 16)}...`
          );

          if (DRY_RUN) {
            log("  [dry-run] Skipping transaction submission");
          } else {
            const digest = await submitViolation(v);
            if (digest) {
              log(`  TX submitted: ${digest}`);
              // Remove treaty from cache (it's now VIOLATED)
              treatyCache = treatyCache.filter(
                (t) => t.objectId !== v.treaty.objectId
              );
            } else {
              log("  TX failed -- treaty may already be violated or expired");
            }
          }
        }
      }
    } catch (e: any) {
      log(`Error in poll cycle: ${e.message}`);
    }

    await sleep(POLL_INTERVAL);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`Missing required env var: ${name}`);
    console.error(`Copy .env.example to .env and fill in the values.`);
    process.exit(1);
  }
  return val;
}

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
