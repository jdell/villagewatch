import { PUBLIC_INCIDENT_STATUSES } from "@/lib/constants";
import { PUBLIC_INCIDENT_SELECT, toMapIncident } from "@/lib/incidents";
import { MAP_PATTERN_WINDOW_DAYS, patternMembers } from "@/lib/map/pattern";
import { prisma } from "@/lib/prisma";
import type { MapIncident } from "@/components/incident-map";

/**
 * The other reports in a report's pattern, for the pattern card on its page.
 *
 * Nothing stores which reports a pattern is made of — the AI pass and
 * `detect-patterns.ts` decided a report was `recurring` when it was filed, and
 * kept the count rather than the members. So this applies the rule the map's
 * Show button already applies (`patternMembers`): recurring reports of the same
 * category within the detector's radius and window. One rule, so the card's
 * list and the pins Show frames are the same reports.
 *
 * Published and resolved only, in the report's own village (domain rules 4 and
 * 6) — the card is read by every resident, and a report still in the queue is
 * not one of theirs to see, even when the page's own report is the viewer's.
 * Server only. Degrades to an empty list rather than taking the page down: the
 * card still says "part of a pattern" from the report's own `patternNote`.
 */

export const RELATED_INCIDENTS_LIMIT = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

export async function relatedIncidents(
  incident: MapIncident,
  villageId: string,
): Promise<MapIncident[]> {
  const at = new Date(incident.occurredAt).getTime();
  const window = MAP_PATTERN_WINDOW_DAYS * DAY_MS;

  try {
    const rows = await prisma.incident.findMany({
      where: {
        villageId,
        id: { not: incident.id },
        type: incident.type,
        recurring: true,
        status: { in: [...PUBLIC_INCIDENT_STATUSES] },
        lat: { not: null },
        lng: { not: null },
        occurredAt: { gte: new Date(at - window), lte: new Date(at + window) },
      },
      select: PUBLIC_INCIDENT_SELECT,
      orderBy: { occurredAt: "desc" },
      // The radius is applied below, in metres; this bounds the candidates.
      take: 100,
    });

    const candidates = rows.flatMap((row) => toMapIncident(row) ?? []);

    return patternMembers(incident, candidates)
      .filter((member) => member.id !== incident.id)
      .slice(0, RELATED_INCIDENTS_LIMIT);
  } catch (cause) {
    console.warn("[related-incidents] could not read the pattern", cause);
    return [];
  }
}
