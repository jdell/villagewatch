-- Interest in a village that is not in service yet.
--
-- One new enum and one new table. No column is added to any existing table,
-- nothing a resident can do changes when this lands, and nothing stops working
-- before it: the sign-up form's "My village isn't listed" branch is the only
-- thing that writes here, and the admin view that reads it degrades to an empty
-- section. That is worth stating up front because two of the migrations in this
-- repository are not like that — 7 and 9 close a village's reporting until its
-- coordinator accepts a document.
--
-- ## What is stored, and who it is about
--
-- A name, an email address, a village and county as typed, which of the two
-- things the person is offering, and an optional sentence about why. **This is
-- the only table in the schema holding personal data about somebody who is not
-- a resident of any village**, and it is the only one whose subject cannot sign
-- in to see or delete their own row. `/privacy` §2 and §6 name it for that
-- reason and give an email address as the removal route, because there is no
-- screen that could offer them a button.
--
-- ## Why there is no foreign key to `villages`
--
-- The whole point is a village the directory does not have. `village_name` and
-- `county` are free text, and they are the answer rather than a lookup —
-- resolving them against `villages` on the way in would reject exactly the rows
-- this table exists to collect. Grouping "Cottenham" typed six ways is a read
-- problem, in `src/lib/village-interest.ts`.
--
-- ## Why `village_interest_role` is not `user_role`
--
-- `user_role` decides what somebody can do inside a village and is written only
-- by server code from a verified join code or an administrator's action (domain
-- rule 5). This is a self-declaration from a stranger and grants nothing: a
-- coordinator candidate who later registers is a RESIDENT like anybody else
-- until an administrator appoints them. Sharing the enum would put a
-- self-service route to the word "coordinator" one careless join away.
--
-- ## After this runs
--
-- Re-run `prisma/sql/rls_policies.sql`. A new table arrives with RLS **off**
-- and every row readable by the anon key, and here that would be a list of
-- names and email addresses of people who are not members of anything.
-- `prisma/sql/postgis.sql` does **not** need re-running: there is no geography
-- column, on purpose — an interest row has no location beyond a place name.

CREATE TYPE "village_interest_role" AS ENUM ('RESIDENT', 'COORDINATOR_CANDIDATE');

CREATE TABLE "village_interest" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "village_name" TEXT NOT NULL,
    "county" TEXT NOT NULL,
    "role" "village_interest_role" NOT NULL,
    "motivation" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "village_interest_pkey" PRIMARY KEY ("id")
);

-- The admin view groups by village and orders by recency.
CREATE INDEX "village_interest_village_name_created_at_idx"
    ON "village_interest" ("village_name", "created_at");

-- So "how many coordinator candidates are waiting" is not a full scan.
CREATE INDEX "village_interest_role_idx" ON "village_interest" ("role");
