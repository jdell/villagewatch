-- Community mode: the two-tier compliance model.
--
-- Until now every village was a parish council's village. The gate asked for a
-- DPIA, an Appropriate Policy Document and a processing agreement, all accepted
-- by a coordinator **on the council's behalf** — which is the right set of
-- documents when a council is the data controller and an impossible set when
-- there is no council at all. Most neighbourhood watch groups are half a dozen
-- neighbours and a WhatsApp group. Asking them to produce an Article 35 impact
-- assessment before their first report is asking them not to start.
--
-- So a village now declares which model it runs under:
--
--   * `community` (the default) — the **coordinator** is the data controller
--     and accepts one document, `docs/COMMUNITY_DPA.md`, which carries the
--     Article 28(3) processing terms and the DPA 2018 Schedule 1 paragraph 5
--     policy document together, written for a volunteer rather than a clerk.
--   * `council` — unchanged. The council is the controller and adopts all three.
--
-- The paragraph 5 condition is **not** dropped in community mode and could not
-- be: it is what authorises processing criminal offence data at all, whoever
-- the controller is. It is folded into the one document instead. See
-- `src/lib/compliance.ts`.
--
-- Three statements.
--
-- 1. `mode`, defaulting to `community`. `NOT NULL` with a default is safe on a
--    live table — every existing row gets the default in place, and no read
--    path can meet a null.
-- 2. The coordinator's acceptance, nullable, no default: null means not
--    accepted, exactly like the three council columns beside it.
-- 3. **The backfill, which is the statement that matters.** Without it, a
--    village part-way through or finished with the council flow would wake up
--    in `community` mode owing a document it has never seen, and its reporting
--    would close — a compliance feature causing the outage it exists to
--    prevent, which is the failure mode `20260728150000_village_dpa_gate`
--    already taught this codebase once. Any village that has accepted *any* of
--    the three is a council village and is marked as one. On this deployment it
--    matches nothing: no acceptance has ever been recorded anywhere.
--
-- No CHECK constraint on the two values, deliberately — the same reasoning
-- `20260728120000_village_privacy_level` gives. The column is written from
-- exactly one place (`setVillageMode`, behind a Zod enum) and read through
-- `resolveVillageMode`, which falls back rather than throws, so a constraint
-- would buy a 500 on a bad write in exchange for an `ALTER TABLE` every time
-- the set changes.
--
-- **Re-run `prisma/sql/rls_policies.sql` after this.** The `villages` SELECT
-- grant is enumerated per column, so `mode` and `community_dpa_accepted_at` are
-- unreadable through PostgREST until that file names them — which is the
-- intended default for a new column, and they are named there now.
-- `community_dpa_accepted_by_id` is deliberately **not** granted, alongside the
-- three existing `*_accepted_by_id` columns: they are `users.id` values, and the
-- timestamps are granted while the identities are not.

-- AlterTable
ALTER TABLE "villages" ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'community',
                       ADD COLUMN     "community_dpa_accepted_at" TIMESTAMP(3),
                       ADD COLUMN     "community_dpa_accepted_by_id" UUID;

-- AddForeignKey
ALTER TABLE "villages" ADD CONSTRAINT "villages_community_dpa_accepted_by_id_fkey"
  FOREIGN KEY ("community_dpa_accepted_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: a village that has accepted any council document is a council village.
UPDATE "villages"
SET "mode" = 'council'
WHERE "dpia_accepted_at" IS NOT NULL
   OR "apd_accepted_at" IS NOT NULL
   OR "dpa_accepted_at" IS NOT NULL;
