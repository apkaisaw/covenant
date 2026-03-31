/**
 * GraphQL event polling — fetches KillmailCreatedEvent with cursor pagination.
 */

import { SUI_GRAPHQL_URL, KILLMAIL_EVENT_TYPE, log } from "./config.js";

export interface KillMailEvent {
  killerId: number;
  victimId: number;
  killmailId: number;
  killTimestamp: number;
  solarSystemId: number;
}

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

export async function fetchKillMailEvents(
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

    const body = (await res.json()) as any;
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
