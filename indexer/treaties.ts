/**
 * Treaty loading — reads active treaties and member tables from chain.
 */

import { client, COVENANT_PACKAGE_ID, ORACLE_CAP_ID, CLOCK, log } from "./config.js";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import type { KillMailEvent } from "./graphql.js";

export interface TreatyInfo {
  objectId: string;
  status: number;
  violationCount: number;
  allianceALeader: string;
  allianceBLeader: string;
  allianceAMembers: Set<number>;
  allianceBMembers: Set<number>;
}

export interface ViolationMatch {
  treaty: TreatyInfo;
  attackerCharacterId: number;
  victimCharacterId: number;
  killmailId: number;
}

export async function fetchActiveTreaties(): Promise<TreatyInfo[]> {
  const treaties: TreatyInfo[] = [];
  let cursor: string | undefined;

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

async function fetchTreatyObject(objectId: string): Promise<TreatyInfo | null> {
  const res = await client.getObject({
    id: objectId,
    options: { showContent: true },
  });

  const content = res.data?.content;
  if (content?.dataType !== "moveObject") return null;

  const fields = content.fields as any;
  if (!fields) return null;

  const membersA = await readTableMembers(fields.alliance_a_members?.fields?.id?.id);
  const membersB = await readTableMembers(fields.alliance_b_members?.fields?.id?.id);

  return {
    objectId,
    status: Number(fields.status),
    violationCount: Number(fields.violation_count ?? 0),
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
      const key = Number(field.name?.value ?? 0);
      if (key > 0) members.add(key);
    }

    cursor = res.hasNextPage ? (res.nextCursor as string) : undefined;
  } while (cursor);

  return members;
}

export function matchViolations(
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

export async function submitViolation(
  match: ViolationMatch,
  keypair: Ed25519Keypair
): Promise<string | null> {
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
