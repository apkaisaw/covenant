/**
 * Covenant KillMail Monitor
 *
 * Polls KillmailCreatedEvent from Sui GraphQL, matches attacker/victim
 * against active treaty member lists, and submits report_violation()
 * transactions when a treaty breach is detected.
 *
 * Graduated penalty: 1st violation = 20%, 2nd = 40%, 3rd = 100% + treaty terminated.
 * After a non-terminal violation, the treaty stays active and continues to be monitored.
 *
 * Usage:
 *   npx tsx monitor.ts            # live mode (submits transactions)
 *   npx tsx monitor.ts --dry-run  # dry-run mode (log only, no tx)
 */

import {
  COVENANT_PACKAGE_ID,
  KILLMAIL_EVENT_TYPE,
  POLL_INTERVAL,
  DRY_RUN,
  loadKeypair,
  log,
  sleep,
} from "./config.js";
import { fetchKillMailEvents } from "./graphql.js";
import {
  fetchActiveTreaties,
  matchViolations,
  submitViolation,
  type TreatyInfo,
} from "./treaties.js";

const MAX_VIOLATIONS_BEFORE_TERMINATION = 3;

async function main() {
  log("=== Covenant KillMail Monitor ===");
  log(`Mode: ${DRY_RUN ? "DRY-RUN (no transactions)" : "LIVE"}`);
  log(`Package: ${COVENANT_PACKAGE_ID}`);
  log(`KillMail event: ${KILLMAIL_EVENT_TYPE}`);
  log(`Poll interval: ${POLL_INTERVAL / 1000}s`);
  log("");

  const keypair = loadKeypair();
  if (keypair) {
    log(`Oracle address: ${keypair.getPublicKey().toSuiAddress()}`);
  }

  let eventCursor: string | null = null;
  let treatyCache: TreatyInfo[] = [];
  let treatyCacheAge = 0;
  const TREATY_CACHE_TTL = 5 * 60 * 1000;

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
              `B: ${t.allianceBMembers.size} members | ` +
              `violations: ${t.violationCount}`
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
          const strike = v.treaty.violationCount + 1;
          const pct =
            strike >= MAX_VIOLATIONS_BEFORE_TERMINATION ? 100 : strike === 2 ? 40 : 20;
          const terminal = strike >= MAX_VIOLATIONS_BEFORE_TERMINATION;

          log(
            `VIOLATION DETECTED! ` +
              `Attacker ${v.attackerCharacterId} killed ${v.victimCharacterId} ` +
              `(killmail #${v.killmailId}) ` +
              `| Treaty ${v.treaty.objectId.slice(0, 16)}... ` +
              `| Strike ${strike}: ${pct}% penalty${terminal ? " [TERMINAL]" : ""}`
          );

          if (DRY_RUN) {
            log("  [dry-run] Skipping transaction submission");
          } else if (keypair) {
            const digest = await submitViolation(v, keypair);
            if (digest) {
              log(`  TX submitted: ${digest}`);
              // Update cache: increment violation count
              v.treaty.violationCount++;
              if (terminal) {
                // Remove terminated treaty from cache
                treatyCache = treatyCache.filter(
                  (t) => t.objectId !== v.treaty.objectId
                );
              }
              // Force treaty cache refresh on next cycle to get accurate state
              treatyCacheAge = 0;
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

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
