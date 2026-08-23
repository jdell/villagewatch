-- Incident votes — the village's own view of how serious a report is.
--
-- One new enum, one new table, and no change to any existing one. Nothing a
-- resident can do changes when this lands and nothing stops working before it:
-- every read on top of this table is an ordering or a count that degrades to
-- "no votes yet", and the vote buttons are the last thing rendered on a card.
-- That is deliberate, and it is worth stating up front because two of the
-- migrations in this repository are not like that (7 and 9 close a village's
-- reporting until its coordinator accepts a document).
--
-- ## What is stored
--
-- Who voted, on what, which way, and when. The severity on an incident is the
-- reporter's own assessment; this is everybody else's, and it moves nothing
-- automatically — no status, no severity, no alert. What it produces is an
-- ordering, on the coordinator's dashboard and in the "most concerning" section
-- of the document that goes to a PCSO.
--
-- ## Why the unique key is the whole design
--
-- `incident_votes_incident_id_user_id_key` is what makes one resident hold one
-- opinion. `POST /api/incidents/[id]/vote` upserts against it rather than
-- reading and then writing, so two taps in the same second cannot leave
-- somebody counted twice — the same reasoning the incident reference's
-- composite key carries, and the same reason it is a constraint rather than a
-- lock.
--
-- ## Why both foreign keys cascade
--
-- Neither a vote on a report that is gone nor a vote by a person who is gone is
-- a record of anything. That is the opposite of `incidents.reporter_id`, which
-- is `ON DELETE SET NULL` because the audit trail names the row and the row has
-- to outlive its reporter (domain rule 7) — no `audit_logs` row points at a
-- vote, because a vote is not a decision anybody is accountable for.
--
-- The cascade is a backstop rather than the mechanism. `src/lib/erasure.ts`
-- deletes votes explicitly in both directions — closing an account deletes every
-- vote it cast, erasing a report deletes every vote cast on it — because
-- `eraseAccount` does not delete the `users` row at all and `removeIncident`
-- keeps the `incidents` row as a tombstone, so neither cascade would ever fire.
--
-- ## After this runs
--
-- **Re-run `prisma/sql/rls_policies.sql`.** A new table arrives with RLS *off*
-- and every row readable by the anon key — which here would mean the anon key
-- could read who in a village thought which of their neighbours' reports was
-- overblown. That file now enables it and grants `authenticated` own-rows
-- SELECT, INSERT, UPDATE and DELETE, scoped to published reports in their own
-- village. There is deliberately no village-wide SELECT: the counts a resident
-- sees are computed by the application, which runs as the table owner.
--
-- `prisma/sql/postgis.sql` does **not** need re-running. There is no geography
-- column here — a vote is about a report, and the report already has the point.

-- CreateEnum
CREATE TYPE "vote_direction" AS ENUM ('UP', 'DOWN');

-- CreateTable
CREATE TABLE "incident_votes" (
    "id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "vote" "vote_direction" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incident_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incident_votes_incident_id_vote_idx" ON "incident_votes"("incident_id", "vote");

-- CreateIndex
CREATE INDEX "incident_votes_user_id_idx" ON "incident_votes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "incident_votes_incident_id_user_id_key" ON "incident_votes"("incident_id", "user_id");

-- AddForeignKey
ALTER TABLE "incident_votes" ADD CONSTRAINT "incident_votes_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_votes" ADD CONSTRAINT "incident_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
