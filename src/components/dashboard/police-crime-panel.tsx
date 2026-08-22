import { ExternalLink, Mail, Phone, Shield } from "lucide-react";
import { BreakdownBar, type BreakdownRow } from "@/components/dashboard/breakdown-bar";
import {
  APP_NAME,
  POLICE_ATTRIBUTION,
  POLICE_COMPARISON_NOTE,
  POLICE_DATA_URL,
} from "@/lib/constants";
import type { PoliceComparison, PoliceTeam } from "@/lib/police-report";
import {
  policeMissingMonthsNote,
  policeMonthsLabel,
  policeSourceLabel,
} from "@/lib/police-report";

/**
 * The official recorded-crime figures, beside the village's own.
 *
 * A Server Component with no state and no client bundle, like every other
 * panel on `/dashboard`. Everything it renders was read from Postgres by
 * `src/lib/police-data.ts`; nothing here reaches data.police.uk, because a
 * page render that waited on a third party would put somebody else's uptime in
 * front of a coordinator's queue.
 *
 * ## Why the two numbers are side by side and not in one chart
 *
 * This is the panel that answers the hardest question a coordinator gets at a
 * parish meeting — "is this getting worse, or are we just reporting more of
 * it?" — and it can only answer it if the two series stay separate. A police
 * "burglary" is a crime an officer recorded after a decision; a VillageWatch
 * `BURGLARY` is what a resident thought they saw at the time. They are counted
 * over different areas (the API searches a mile around the village centre, not
 * the parish boundary) and published two months apart. One chart with both in
 * it would look like a comparison and be an assertion.
 *
 * So: two counts, two breakdowns, and `POLICE_COMPARISON_NOTE` between them
 * saying what differs. The same constant the report on screen, the report on
 * the clipboard and the PDF all carry.
 *
 * ## Absence is rendered, never rounded to zero
 *
 * `comparison.months` is what this deployment holds and `missingMonths` is what
 * it does not, and both are on the panel. Without that pair a coordinator
 * looking at a quiet-looking figure could not tell a peaceful month from an
 * unpublished one — and would take the first reading into a meeting.
 */
export function PoliceCrimePanel({
  comparison,
  team,
  periodLabel,
}: {
  /** Null when this deployment holds nothing for the village. */
  comparison: PoliceComparison | null;
  /** Null until a sync has resolved the neighbourhood. */
  team: PoliceTeam | null;
  /** What the coordinator selected above, for the heading. */
  periodLabel: string;
}) {
  // Nothing held and no neighbourhood resolved: the sync has never run for this
  // village. Rendering an empty panel would be a section of the dashboard that
  // looks broken; rendering nothing is what a village without the feature sees.
  if (!comparison && !team) return null;

  const source = comparison ? policeSourceLabel(comparison) : null;
  const missing = comparison ? policeMissingMonthsNote(comparison) : null;
  const held = comparison && comparison.months.length > 0;

  const categoryRows: BreakdownRow[] =
    comparison?.byCategory.map((row) => ({
      key: row.category,
      label: row.label,
      count: row.count,
    })) ?? [];

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Shield className="size-4 text-slate-400" aria-hidden />
        Police recorded crime
      </h2>
      <p className="mt-0.5 text-xs text-slate-500">
        {held
          ? `Published by the police for ${policeMonthsLabel(comparison.months)} — the calendar months your selected period (${periodLabel.toLowerCase()}) covers.`
          : `No official figures are held for ${periodLabel.toLowerCase()} yet. Police data is published about two months after the month it covers.`}
      </p>

      {held && (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Figure
              label="Police recorded crimes"
              value={comparison.total}
              note="Within a mile of the village centre"
            />
            <Figure
              label={`${APP_NAME} reports`}
              value={comparison.villageReports}
              note="Published in the same months"
            />
          </div>

          {categoryRows.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-slate-900">
                By police category
              </h3>
              <div className="mt-3">
                <BreakdownBar
                  rows={categoryRows}
                  emptyMessage="No recorded crime in these months."
                />
              </div>
            </div>
          )}
        </>
      )}

      {missing && (
        <p className="mt-4 text-xs leading-relaxed text-amber-800">{missing}</p>
      )}

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        {POLICE_COMPARISON_NOTE}
      </p>

      {team && <TeamCard team={team} />}

      <p className="mt-4 text-xs text-slate-400">
        {POLICE_ATTRIBUTION}{" "}
        <a
          href={POLICE_DATA_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-slate-600"
        >
          data.police.uk
          <ExternalLink className="size-3" aria-hidden />
        </a>
        {source && !team && <> · {source}</>}
      </p>
    </section>
  );
}

function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: number;
  note: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-3.5 ring-1 ring-slate-200">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-slate-900">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-slate-500">{note}</p>
    </div>
  );
}

/**
 * The neighbourhood policing team, auto-populated from the force's own list.
 *
 * These are published details of a public office — the names, ranks and contact
 * addresses a force prints on its own neighbourhood page so that residents can
 * get in touch. What is deliberately absent is the `bio` the API returns beside
 * each officer: it is force-authored HTML, and it never reaches the database
 * because `policeOfficerSchema` does not describe the field. See
 * `src/lib/police-api.ts`.
 */
function TeamCard({ team }: { team: PoliceTeam }) {
  return (
    <div className="mt-5 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <h3 className="text-sm font-semibold text-slate-900">
        Your neighbourhood policing team
      </h3>
      <p className="mt-0.5 text-xs text-slate-500">
        {team.name}
        {team.forceName ? ` · ${team.forceName}` : ""}
      </p>

      {team.description && (
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          {team.description}
        </p>
      )}

      {team.members.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {team.members.map((member) => (
            <li
              key={`${member.rank ?? ""}-${member.name}`}
              className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm"
            >
              <span className="font-medium text-slate-900">{member.name}</span>
              {member.rank && (
                <span className="text-xs text-slate-500">{member.rank}</span>
              )}
              {member.email && (
                <a
                  href={`mailto:${member.email}`}
                  className="text-xs text-brand-700 underline underline-offset-2"
                >
                  {member.email}
                </a>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-slate-500">
          The force publishes no team list for this neighbourhood.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        {team.telephone && (
          <a
            href={`tel:${team.telephone.replace(/\s+/g, "")}`}
            className="inline-flex items-center gap-1.5 text-slate-700 hover:text-slate-900"
          >
            <Phone className="size-3.5 text-slate-400" aria-hidden />
            {team.telephone}
          </a>
        )}
        {team.email && (
          <a
            href={`mailto:${team.email}`}
            className="inline-flex items-center gap-1.5 text-slate-700 hover:text-slate-900"
          >
            <Mail className="size-3.5 text-slate-400" aria-hidden />
            {team.email}
          </a>
        )}
        {/*
          `urlForce` has already been through the `http(s)`-only check in
          `police-api.ts` — the same guard `getVillageChannel` puts in front of
          a stored channel link, and here because this href came out of somebody
          else's CMS.
        */}
        {team.url && (
          <a
            href={team.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-slate-700 hover:text-slate-900"
          >
            <ExternalLink className="size-3.5 text-slate-400" aria-hidden />
            Force page
          </a>
        )}
      </div>

      <p className="mt-3 text-xs text-slate-400">
        In an emergency always call 999. For anything else, 101.
      </p>
    </div>
  );
}
