import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { PACKAGE_ID, MODULE } from "./constants";

const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl("testnet"), network: "testnet" });
export { client };

export interface TreatyData {
  objectId: string;
  treatyType: number;
  description: string;
  allianceALeader: string;
  allianceBLeader: string;
  allianceAName: string;
  allianceBName: string;
  depositRequired: number;
  status: number;
  createdAtMs: number;
  effectiveAtMs: number;
  expiresAtMs: number;
  violationCount: number;
}

export async function fetchTreatyIds(): Promise<string[]> {
  const ids: string[] = [];

  const events = await client.queryEvents({
    query: { MoveEventType: `${PACKAGE_ID}::${MODULE}::TreatyCreated` },
    limit: 50,
  });

  for (const ev of events.data) {
    const json = ev.parsedJson as any;
    if (json?.treaty_id) ids.push(json.treaty_id);
  }

  return ids;
}

export async function fetchTreaty(objectId: string): Promise<TreatyData | null> {
  try {
    const res = await client.getObject({ id: objectId, options: { showContent: true } });
    const content = res.data?.content;
    if (content?.dataType !== "moveObject") return null;
    const f = content.fields as any;
    return {
      objectId,
      treatyType: Number(f.treaty_type),
      description: f.description,
      allianceALeader: f.alliance_a_leader,
      allianceBLeader: f.alliance_b_leader,
      allianceAName: f.alliance_a_name,
      allianceBName: f.alliance_b_name,
      depositRequired: Number(f.deposit_required),
      status: Number(f.status),
      createdAtMs: Number(f.created_at_ms),
      effectiveAtMs: Number(f.effective_at_ms),
      expiresAtMs: Number(f.expires_at_ms),
      violationCount: Number(f.violation_count),
    };
  } catch {
    return null;
  }
}

export async function fetchAllianceStats(_address: string): Promise<{
  signed: number; honored: number; violated: number; compensationPaid: number; honorRate: number;
} | null> {
  // TODO: implement devInspect call to treaty_registry::alliance_stats
  // For now return null (no data)
  return null;
}
