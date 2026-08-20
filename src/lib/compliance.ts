import type { Session } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_VILLAGE_MODE,
  documentsForMode,
  resolveVillageMode,
  type VillageMode,
} from "@/lib/constants";

/**
 * The legal compliance gate. **Server only.**
 *
 * A village accepts no report until its coordinator has read and accepted the
 * documents its **mode** calls for. There are two modes and they differ in who
 * the data controller is:
 *
 * - **`community`** (the default) — no parish council is involved, the
 *   coordinator is the controller, and there is one document:
 *   `docs/COMMUNITY_DPA.md`, which carries the Article 28(3) processing terms
 *   and the DPA 2018 Schedule 1 paragraph 5 policy document together.
 * - **`council`** — a parish council is the controller and adopts three: the
 *   Data Protection Impact Assessment (`docs/DPIA.md`), the Appropriate Policy
 *   Document (`docs/APD_TEMPLATE.md`) and the data processing agreement
 *   (`docs/DATA_PROCESSING_AGREEMENT.md`).
 *
 * ## Community mode is a different set of documents, not a lighter gate
 *
 * The paragraph 5 condition is not skipped and could not be — it is what
 * authorises processing criminal offence data at all, and it attaches to the
 * processing rather than to the kind of body doing it. It is folded into the one
 * agreement instead. What community mode genuinely does without is the Article
 * 35 assessment, which is a judgement rather than an omission: `docs/DPIA.md`
 * assesses this service and rates no risk high after mitigation, and a community
 * village runs the same software with the same safeguards.
 *
 * The gate itself is unchanged in shape. It still blocks, it still fails in the
 * three directions below, and a village that has accepted nothing still takes no
 * reports.
 *
 * ## Why this is a gate and not a checklist item
 *
 * Reports describe suspected criminal activity, which is **criminal offence
 * data** under UK GDPR Article 10. Article 10 permits processing it only where
 * domestic law authorises it, and the authorisation here is DPA 2018 s.10(5)
 * with Schedule 1 Part 2 paragraph 10 — preventing or detecting unlawful acts.
 * Paragraph 5 of that Schedule makes an Appropriate Policy Document a
 * **condition** of relying on paragraph 10.
 *
 * So a village processing reports without an APD in place is not a village with
 * incomplete paperwork. It is a village whose processing has no lawful
 * authorisation. That is why this blocks filing rather than showing a reminder,
 * and why nothing here is dismissible.
 *
 * The processing agreement is here for the same shape of reason rather than as a
 * third piece of paperwork. Article 28(3) permits a controller to use a
 * processor **only** under a written contract and says what it must cover, so a
 * council with none is in breach from the first report filed — an authorisation
 * that has to exist before the processing, not a record made after it.
 *
 * ## Three documents, three acceptances, three audit rows — in council mode
 *
 * They could have been one checkbox. They are not, because they answer to three
 * different instruments — Article 35, Schedule 1 paragraph 5 and Article 28(3) —
 * and a regulator asking "when did the controller adopt its APD" is entitled to
 * an answer that is not "at the same time as something else". Each acceptance
 * records who and when, and writes its own `AuditLog` row.
 *
 * Community mode is one document and therefore one row, and that is not the same
 * compromise: it is one *document*, so there is one adoption date to record. The
 * reason a council's three are not collapsed is that the council genuinely holds
 * three instruments, not that three rows are better than one.
 *
 * The third one records **half** of something. The DPIA and the APD are the
 * council's own documents and the council adopts them alone; the processing
 * agreement is a contract, and is not in force until Yakasista Ltd has signed
 * the paper document too. Nothing here can evidence the processor's signature,
 * and this deliberately does not pretend to — what `dpaAcceptedAt` records is
 * the council's acceptance of the terms, which is the half a coordinator can
 * give on a screen.
 *
 * ## The three states, and why "unavailable" is one of them
 *
 * Four of the columns arrive with `20260728090000_village_compliance_gate`, two
 * more with `20260728150000_village_dpa_gate`, and `mode` plus the community
 * acceptance with `20260820120000_village_community_mode`. Until those
 * migrations run, a query naming them throws — and this check sits in front of
 * every report filed in the app.
 *
 * So it distinguishes "not accepted" from "no column to accept into", the same
 * way `getVillageParishCouncil` does, and the two fail in **opposite
 * directions**:
 *
 * - **Not accepted** blocks filing. That is the gate doing its job.
 * - **No column** allows filing, loudly. A missing migration is a deployment
 *   fault, not a council's decision, and taking every village's reporting
 *   offline because a `SELECT` named a column that is not there yet would be a
 *   compliance feature causing the outage it exists to prevent. The dashboard
 *   says the migration is missing and names it; the server logs it on every
 *   check.
 * - **Any other database error** blocks. It is the same reasoning
 *   `getVillageAutoApprove` uses: if we do not know what the council decided,
 *   the safe guess is the one that does not process. Filing needs the database
 *   for its real work anyway, so this refuses to be the thing that pretends
 *   otherwise.
 */

/** One document's acceptance. */
export type DocumentAcceptance = {
  acceptedAt: Date;
  /** The coordinator who accepted, when their profile still resolves. */
  acceptedBy: { id: string; fullName: string; email: string } | null;
};

export type ComplianceStatus =
  | {
      /** The columns exist, so the answer below is the village's own. */
      available: true;
      /** Which model this village runs under, narrowed from the column. */
      mode: VillageMode;
      dpia: DocumentAcceptance | null;
      apd: DocumentAcceptance | null;
      /** The council's half of the Article 28(3) agreement. See the header. */
      dpa: DocumentAcceptance | null;
      /** The coordinator's own acceptance, in community mode. */
      communityDpa: DocumentAcceptance | null;
      /** Everything this village's mode asks for — it may accept reports. */
      complete: boolean;
    }
  | {
      /**
       * `20260728090000_village_compliance_gate`,
       * `20260728150000_village_dpa_gate` or
       * `20260820120000_village_community_mode` has not been applied here.
       * Nothing can be accepted and nothing is blocked; see the header.
       */
      available: false;
      mode: VillageMode;
      dpia: null;
      apd: null;
      dpa: null;
      communityDpa: null;
      complete: boolean;
    };

/**
 * Postgres `42703` — undefined column — however Prisma happens to surface it.
 *
 * Three shapes, for the reason `isMissingParishCouncilColumn` gives in
 * `src/lib/villages.ts`: the column is in `schema.prisma` and missing from the
 * database, which Prisma reports differently depending on how the statement was
 * built. Matched narrowly on purpose — a broad catch here would swallow a
 * genuinely unreachable database and let reports through on a deployment where
 * nothing works.
 */
function isMissingComplianceColumn(cause: unknown): boolean {
  if (typeof cause !== "object" || cause === null) return false;

  const code = (cause as { code?: unknown }).code;
  if (code === "P2022" || code === "42703") return true;

  const message = (cause as { message?: unknown }).message;
  return (
    typeof message === "string" &&
    // `dpa_accepted` is its own test rather than a prefix of the first: the
    // strings are `dpia_accepted_at` and `dpa_accepted_at`, and neither
    // contains the other. Miss it and a database with migration 7 but not 8
    // takes every village offline on the message-only shape.
    //
    // `community_dpa_accepted` is the same trap one migration later, and it
    // *does* contain `dpa_accepted`, so the existing branch already catches it.
    // It is named anyway: relying on one string being a substring of another is
    // the kind of thing a later rename breaks silently, in the direction that
    // takes villages offline.
    //
    // **`mode` is deliberately not matched on the message.** It is three
    // letters that appear in half the errors Postgres emits, and a match on it
    // would turn an unrelated failure into "allow every report through". It
    // needs no branch: it arrives in the same migration as
    // `community_dpa_accepted_at`, so a database missing one is missing both,
    // and `P2022`/`42703` catch it in the two shapes that carry a code.
    (message.includes("dpia_accepted") ||
      message.includes("apd_accepted") ||
      message.includes("dpa_accepted") ||
      message.includes("community_dpa_accepted"))
  );
}

const UNAVAILABLE: ComplianceStatus = {
  available: false,
  // The mode is unknowable without the column, and the default is the honest
  // guess: every village gets `community` from the migration, so a database
  // that has not run it would become one.
  mode: DEFAULT_VILLAGE_MODE,
  dpia: null,
  apd: null,
  dpa: null,
  communityDpa: null,
  // True, and this is the load-bearing line in the module. See the header: an
  // unapplied migration must not take every village's reporting offline.
  complete: true,
};

/** The blocked answer, for the two places that reach it. */
const BLOCKED: ComplianceStatus = {
  available: true,
  mode: DEFAULT_VILLAGE_MODE,
  dpia: null,
  apd: null,
  dpa: null,
  communityDpa: null,
  complete: false,
};

/**
 * Whether this village has everything its mode asks for.
 *
 * Two clauses in council mode, and the second one is the interesting half.
 *
 * **Community** is exactly what it looks like: the coordinator has accepted the
 * agreement, or they have not.
 *
 * **Council** is the three documents — *or* a community acceptance that has not
 * been superseded yet. That is not a loophole; it is the transition working
 * correctly. A village upgrades by declaring that a council is taking it on, and
 * the council then has to meet, read three documents and adopt them, which takes
 * weeks. Until it does, **the coordinator is still the controller** and their
 * agreement is still what authorises the processing — nothing about the village
 * has changed except an intention. Blocking there would take a running village
 * offline for the duration of its own paperwork, which is the surest way to make
 * a coordinator not press the button.
 *
 * A council village that never had a community acceptance — one activated
 * straight into `council` mode — is blocked until all three land, which is the
 * behaviour this module has always had.
 *
 * The community acceptance is never cleared on upgrade, so this stays true, and
 * it should: the coordinator *was* the controller for that period and the record
 * of it is what shows the handover was orderly.
 */
function isComplete(input: {
  mode: VillageMode;
  dpia: DocumentAcceptance | null;
  apd: DocumentAcceptance | null;
  dpa: DocumentAcceptance | null;
  communityDpa: DocumentAcceptance | null;
}): boolean {
  if (input.mode === "community") return input.communityDpa !== null;

  return (
    (input.dpia !== null && input.apd !== null && input.dpa !== null) ||
    input.communityDpa !== null
  );
}

/** What `/dashboard/compliance` renders and what the gate is decided from. */
export async function getVillageCompliance(
  villageId: string,
): Promise<ComplianceStatus> {
  if (!process.env.DATABASE_URL) return UNAVAILABLE;

  try {
    const village = await prisma.village.findUnique({
      where: { id: villageId },
      select: {
        mode: true,
        dpiaAcceptedAt: true,
        apdAcceptedAt: true,
        dpaAcceptedAt: true,
        communityDpaAcceptedAt: true,
        dpiaAcceptedBy: {
          select: { id: true, fullName: true, email: true },
        },
        apdAcceptedBy: {
          select: { id: true, fullName: true, email: true },
        },
        dpaAcceptedBy: {
          select: { id: true, fullName: true, email: true },
        },
        communityDpaAcceptedBy: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    if (!village) {
      // No village is not the same as no columns. A caller holding a village id
      // that resolves to nothing has a bigger problem than compliance, and it
      // must not read as "accepted".
      return BLOCKED;
    }

    const dpia = village.dpiaAcceptedAt
      ? { acceptedAt: village.dpiaAcceptedAt, acceptedBy: village.dpiaAcceptedBy }
      : null;

    const apd = village.apdAcceptedAt
      ? { acceptedAt: village.apdAcceptedAt, acceptedBy: village.apdAcceptedBy }
      : null;

    const dpa = village.dpaAcceptedAt
      ? { acceptedAt: village.dpaAcceptedAt, acceptedBy: village.dpaAcceptedBy }
      : null;

    const communityDpa = village.communityDpaAcceptedAt
      ? {
          acceptedAt: village.communityDpaAcceptedAt,
          acceptedBy: village.communityDpaAcceptedBy,
        }
      : null;

    // `resolveVillageMode` rather than a cast: the column is a `String` with no
    // CHECK constraint, and what it decides is whether a resident can file a
    // report — an unrecognised value must narrow to a mode rather than throw in
    // front of them.
    const mode = resolveVillageMode(village.mode);

    return {
      available: true,
      mode,
      dpia,
      apd,
      dpa,
      communityDpa,
      complete: isComplete({ mode, dpia, apd, dpa, communityDpa }),
    };
  } catch (cause) {
    if (isMissingComplianceColumn(cause)) {
      console.error(
        "villages.dpia_accepted_at / apd_accepted_at / dpa_accepted_at are " +
          "missing, so the compliance gate cannot be enforced and reporting is " +
          "being allowed. Have 20260728090000_village_compliance_gate and " +
          "20260728150000_village_dpa_gate been applied?",
        cause,
      );

      return UNAVAILABLE;
    }

    console.error(
      "Could not read the compliance state for village %s; refusing reports",
      villageId,
      cause,
    );

    return BLOCKED;
  }
}

/**
 * The one question `POST /api/incidents` and the wizard host ask.
 *
 * Deliberately not a boolean on its own: the two callers that block need to
 * render a different sentence when the reason is an unapplied migration, and
 * collapsing that into `false` would tell a resident to contact a coordinator
 * who has nothing to click.
 */
export async function canVillageAcceptIncidents(
  villageId: string,
): Promise<boolean> {
  const status = await getVillageCompliance(villageId);
  return status.complete;
}

/**
 * What a resident is told when their village has not completed the gate.
 *
 * A constant rather than a string at each call site, because it is rendered by
 * a Server Component, a Client Component and a JSON route, and three copies of
 * a sentence about a legal obligation is three chances for one of them to
 * become wrong.
 */
export const COMPLIANCE_BLOCKED_MESSAGE =
  "Your village coordinator needs to complete the compliance setup before " +
  "incidents can be reported. Contact your coordinator.";

export type ComplianceAcceptance = {
  /** Accept the Data Protection Impact Assessment. Council mode. */
  dpia: boolean;
  /** Accept the Appropriate Policy Document. Council mode. */
  apd: boolean;
  /** Accept the data processing agreement, on the council's side of it. */
  dpa: boolean;
  /** Accept the Community Coordinator Agreement, as the controller. */
  community: boolean;
};

export type ComplianceWrite =
  | { ok: true; accepted: ComplianceAcceptance; complete: boolean }
  | { ok: false; reason: "unmigrated" | "nothing_selected" | "failed"; error: string };

/**
 * Records a coordinator's acceptance of one, two or all three documents.
 *
 * Three rules, and the first two are what stop this being a toggle:
 *
 * 1. **Acceptance is one-way.** There is no unaccept, and this never clears a
 *    timestamp. A council that adopted an APD on a date did adopt it on that
 *    date, and a screen that could rewrite that would make the record worthless
 *    to the regulator it exists for. Withdrawing from the processing is
 *    suspending the village, which is a different act with its own audit row.
 * 2. **An already-accepted document is left exactly as it was.** Re-accepting
 *    must not move the timestamp onto today or replace the name of the person
 *    who actually read it — the annual review is a new signature on the paper
 *    document, not a second click here. Ticking a box that is already recorded
 *    is a no-op that reports success, because from the coordinator's side
 *    nothing is wrong.
 * 3. **The village id comes from the caller's session, never from the form.**
 *    Domain rule 4. A village id in a form post would be a way to accept a
 *    neighbouring parish's legal documents on their behalf.
 *
 * Returns rather than throws, and distinguishes `unmigrated` from `failed`,
 * because "try again" is a lie when the column does not exist — the coordinator
 * could press that button until somebody runs a migration and it would never
 * work.
 */
export async function acceptCompliance(input: {
  session: Session;
  villageId: string;
  accept: ComplianceAcceptance;
}): Promise<ComplianceWrite> {
  const { session, villageId, accept } = input;

  if (!accept.dpia && !accept.apd && !accept.dpa && !accept.community) {
    return {
      ok: false,
      reason: "nothing_selected",
      error: "Tick the box to accept the document.",
    };
  }

  if (!process.env.DATABASE_URL) {
    return {
      ok: false,
      reason: "failed",
      error: "The database is not configured.",
    };
  }

  const current = await getVillageCompliance(villageId);

  if (!current.available) {
    return {
      ok: false,
      reason: "unmigrated",
      error:
        "This deployment's database does not have the compliance columns yet. " +
        "An administrator needs to apply the migrations " +
        "20260728090000_village_compliance_gate and " +
        "20260728150000_village_dpa_gate before acceptance can be recorded.",
    };
  }

  const now = new Date();

  // Only the documents this village's mode actually asks for. A tick for a
  // document the village is not on the model for is dropped rather than
  // rejected: the screen never renders it, so reaching here means a hand-made
  // POST, and writing it would record a council adopting a DPIA it was never
  // shown — or a coordinator taking on controller duties a council holds.
  const wanted = documentsForMode(current.mode);

  // Only the documents that are both ticked and not already recorded. Rule 2 —
  // an existing acceptance is a fact about a date, not a field to refresh.
  const writeDpia =
    accept.dpia && wanted.includes("dpia") && current.dpia === null;
  const writeApd = accept.apd && wanted.includes("apd") && current.apd === null;
  const writeDpa = accept.dpa && wanted.includes("dpa") && current.dpa === null;
  const writeCommunity =
    accept.community &&
    wanted.includes("community") &&
    current.communityDpa === null;

  if (writeDpia || writeApd || writeDpa || writeCommunity) {
    try {
      await prisma.village.update({
        where: { id: villageId },
        data: {
          ...(writeDpia
            ? { dpiaAcceptedAt: now, dpiaAcceptedById: session.user.id }
            : {}),
          ...(writeApd
            ? { apdAcceptedAt: now, apdAcceptedById: session.user.id }
            : {}),
          ...(writeDpa
            ? { dpaAcceptedAt: now, dpaAcceptedById: session.user.id }
            : {}),
          ...(writeCommunity
            ? {
                communityDpaAcceptedAt: now,
                communityDpaAcceptedById: session.user.id,
              }
            : {}),
        },
      });
    } catch (cause) {
      console.error(
        "Could not record compliance acceptance for village %s",
        villageId,
        cause,
      );

      return {
        ok: false,
        reason: "failed",
        error: "Could not record your acceptance. Try again.",
      };
    }

    // After the write, and allowed to fail silently, on the same reasoning every
    // other post-hoc audit write in the codebase uses: the acceptance has
    // happened, and telling a coordinator it failed when it succeeded would be
    // false. What makes that acceptable here is that the acceptance is *also*
    // recorded on the village row itself, with a timestamp and a person — this
    // trail row is the second copy, not the only one.
    try {
      await prisma.auditLog.createMany({
        data: [
          ...(writeDpia
            ? [
                {
                  actorId: session.user.id,
                  actorEmail: session.user.email,
                  actorRole: session.profile?.role,
                  villageId,
                  action: "compliance.dpia_accepted",
                  entityType: "Village",
                  entityId: villageId,
                  after: { acceptedAt: now.toISOString(), document: "DPIA" },
                },
              ]
            : []),
          ...(writeApd
            ? [
                {
                  actorId: session.user.id,
                  actorEmail: session.user.email,
                  actorRole: session.profile?.role,
                  villageId,
                  action: "compliance.apd_accepted",
                  entityType: "Village",
                  entityId: villageId,
                  after: {
                    acceptedAt: now.toISOString(),
                    document: "Appropriate Policy Document",
                  },
                },
              ]
            : []),
          ...(writeDpa
            ? [
                {
                  actorId: session.user.id,
                  actorEmail: session.user.email,
                  actorRole: session.profile?.role,
                  villageId,
                  action: "compliance.dpa_accepted",
                  entityType: "Village",
                  entityId: villageId,
                  after: {
                    acceptedAt: now.toISOString(),
                    document: "Data Processing Agreement",
                    // The council's half only. The agreement is a contract and
                    // is not in force until the processor has signed the paper
                    // document too; this row must not read as evidence that it
                    // has. See the module header.
                    party: "controller",
                    processor: "Yakasista Ltd",
                  },
                },
              ]
            : []),
          ...(writeCommunity
            ? [
                {
                  actorId: session.user.id,
                  actorEmail: session.user.email,
                  actorRole: session.profile?.role,
                  villageId,
                  action: "compliance.community_dpa_accepted",
                  entityType: "Village",
                  entityId: villageId,
                  after: {
                    acceptedAt: now.toISOString(),
                    document: "Community Coordinator Agreement",
                    // No `party` here, unlike the council's agreement above.
                    // That row records half a contract because the paper copy
                    // waits on a second signature; this one is offered on
                    // standing terms and accepting it forms the contract, so
                    // qualifying it would be inventing a doubt.
                    mode: "community",
                    processor: "Yakasista Ltd",
                  },
                },
              ]
            : []),
        ],
      });
    } catch (cause) {
      console.error(
        "Compliance acceptance for village %s was recorded but not audited",
        villageId,
        cause,
      );
    }
  }

  return {
    ok: true,
    accepted: accept,
    // Recomputed from what was already there plus what was just written, rather
    // than re-reading: the caller revalidates the page, and the answer here is
    // what decides whether the success message says the village is now open.
    // Through `isComplete`, so the two-clause council rule is not restated —
    // one of the two places would eventually disagree with the other.
    complete: isComplete({
      mode: current.mode,
      dpia: current.dpia ?? (writeDpia ? JUST_WRITTEN : null),
      apd: current.apd ?? (writeApd ? JUST_WRITTEN : null),
      dpa: current.dpa ?? (writeDpa ? JUST_WRITTEN : null),
      communityDpa: current.communityDpa ?? (writeCommunity ? JUST_WRITTEN : null),
    }),
  };
}

export type ModeChange =
  | { ok: true; mode: VillageMode }
  | { ok: false; reason: "unmigrated" | "not_an_upgrade" | "failed"; error: string };

/**
 * Moves a village from the community model to the parish council model.
 *
 * The one direction, and the restriction is not squeamishness. Downgrading would
 * mean a screen deciding that a council is no longer the data controller for
 * reports it has been controller of — which is a decision for the council, taken
 * at a meeting, and if it is ever taken the honest record of it is a new village
 * rather than a settings change that leaves three adoption dates hanging against
 * a body that has stepped back. `not_an_upgrade` is what a downgrade gets.
 *
 * **Nothing is cleared.** The community acceptance stays exactly where it is:
 * the coordinator *was* the controller until the council adopted its documents,
 * and that is a fact about a period rather than a state to reset. It is also
 * what keeps the village's reporting open while the council works through three
 * documents — see `isComplete`.
 *
 * Coordinator-gated at the call site, and the village comes from the session
 * (domain rule 4). A village id in the form would be a way to declare that
 * somebody else's parish council has taken their village on.
 */
export async function setVillageMode(input: {
  session: Session;
  villageId: string;
  mode: VillageMode;
}): Promise<ModeChange> {
  const { session, villageId, mode } = input;

  if (!process.env.DATABASE_URL) {
    return {
      ok: false,
      reason: "failed",
      error: "The database is not configured.",
    };
  }

  const current = await getVillageCompliance(villageId);

  if (!current.available) {
    return {
      ok: false,
      reason: "unmigrated",
      error:
        "This deployment's database does not have the compliance columns yet. " +
        "An administrator needs to apply " +
        "20260820120000_village_community_mode before the model can be changed.",
    };
  }

  if (mode !== "council") {
    return {
      ok: false,
      reason: "not_an_upgrade",
      error:
        "A village can move to the parish council model but not back. If the " +
        "council has stepped back, contact us rather than changing this here.",
    };
  }

  if (current.mode === mode) {
    // Already there. Reported as success: from the coordinator's side nothing
    // is wrong, and the same reasoning re-accepting a document uses.
    return { ok: true, mode };
  }

  try {
    await prisma.village.update({
      where: { id: villageId },
      data: { mode },
    });
  } catch (cause) {
    console.error("Could not change the mode for village %s", villageId, cause);

    return {
      ok: false,
      reason: "failed",
      error: "Could not change the compliance model. Try again.",
    };
  }

  // After the write and allowed to fail, like every other post-hoc audit write
  // here. Unlike the acceptances, though, this one is the **only** record of
  // the handover date — the village row holds the new mode and not when it
  // changed — so a failure is logged loudly rather than passed over.
  try {
    await prisma.auditLog.create({
      data: {
        actorId: session.user.id,
        actorEmail: session.user.email,
        actorRole: session.profile?.role,
        villageId,
        action: "village.mode_changed",
        entityType: "Village",
        entityId: villageId,
        before: { mode: current.mode },
        after: {
          mode,
          // The documents the village now owes, so the trail says what changed
          // rather than only that something did.
          documentsRequired: documentsForMode(mode),
          communityAgreementStillInForce: current.communityDpa !== null,
        },
      },
    });
  } catch (cause) {
    console.error(
      "Village %s moved to the %s model but the change was not audited — the " +
        "handover date is now unrecorded",
      villageId,
      mode,
      cause,
    );
  }

  return { ok: true, mode };
}

/**
 * Stands in for an acceptance written a moment ago.
 *
 * `isComplete` only asks whether each is null, so the contents never leave this
 * function — and a placeholder date is safer than threading `now` through, which
 * would look like a value somebody might render.
 */
const JUST_WRITTEN: DocumentAcceptance = {
  acceptedAt: new Date(0),
  acceptedBy: null,
};
