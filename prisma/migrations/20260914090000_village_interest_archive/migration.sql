-- Archiving an interest registration.
--
-- One new enum and three nullable columns on `village_interest`. No table is
-- created, nothing existing is dropped or renamed, and every row already there
-- comes out `PENDING` — which is what it was. Nothing a resident can do changes
-- when this lands: the sign-up form does not read or write any of these
-- columns, and `recordVillageInterest` takes the default.
--
-- ## Why there is no DELETE anywhere in this feature
--
-- An interest row is the only record that somebody asked for a village, and the
-- counts behind "eleven people in your village are waiting" are what a parish
-- council gets quoted. A deleted row takes a figure somebody planned against
-- with it, and takes the evidence of a promise made to a person who has no
-- account and cannot check. So `village_interest_status` has two values and the
-- absent third is deliberate — archiving takes a row off the working list and
-- does nothing else to it.
--
-- Erasure is the exception and is unchanged by this: somebody who writes to the
-- address in `/privacy` §2 still has their row **deleted**, by hand, as the
-- owner. That is a person exercising Article 17 rather than an administrator
-- tidying a list, and it is the one case where the row should not survive.
--
-- ## Why `archived_reason` is one column
--
-- The form offers four fixed reasons and an "other" that takes a sentence. A
-- code column beside a detail column would leave every row carrying one NULL,
-- and a row could be written with both. One column holds a kebab-case code for
-- the four, or the typed sentence for the fifth; the codes are not sentences,
-- so the reader can tell which it is holding. See `archiveReasonLabel` in
-- `src/lib/village-interest.ts`.
--
-- ## After this runs
--
-- Re-run `prisma/sql/rls_policies.sql`. This adds **columns rather than a
-- table**, so RLS is already on and the existing admin SELECT policy already
-- covers them — but `villages` and `incidents` grant SELECT *per column*, and
-- the habit that keeps those right is re-running the file after every schema
-- change rather than deciding each time which kind it was. `postgis.sql` need
-- not be re-run: no geography column, on purpose.

CREATE TYPE "village_interest_status" AS ENUM ('PENDING', 'ARCHIVED');

ALTER TABLE "village_interest"
    ADD COLUMN "status" "village_interest_status" NOT NULL DEFAULT 'PENDING',
    ADD COLUMN "archived_at" TIMESTAMPTZ(3),
    ADD COLUMN "archived_reason" TEXT;

-- The admin view reads one status at a time and defaults to PENDING.
CREATE INDEX "village_interest_status_created_at_idx"
    ON "village_interest" ("status", "created_at");
