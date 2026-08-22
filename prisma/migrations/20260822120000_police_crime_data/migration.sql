-- Official police recorded crime, from data.police.uk.
--
-- Three new tables and no change to any existing one. Nothing a resident can do
-- changes because of this migration: no gate opens or closes, no report moves,
-- and every read path added on top of these tables degrades to "no official
-- data" rather than failing. That is deliberate and worth stating up front,
-- because the two migrations before it in this repository were not like that.
--
-- ## What is stored, and why it is not personal data
--
-- `data.police.uk` is the Home Office's open data service, published under the
-- Open Government Licence v3.0. Every street-level record is snapped to an
-- anonymisation point — a notional location "on or near" a street, chosen so no
-- crime can be tied to an address — and carries no victim, no suspect and no
-- officer. None of the domain rules that govern `incidents` has an analogue
-- here, because there is nothing in these rows to restrict.
--
-- `police_neighbourhoods` is the one table that names people, and it names them
-- in their public office: the neighbourhood team a force publishes on its own
-- website so residents can contact it. Name, rank and the published address.
-- The API's `bio` field is deliberately not stored — it is force-authored HTML
-- and this codebase renders no third-party HTML anywhere.
--
-- ## Why every table is village-scoped anyway
--
-- Not for privacy — for correctness. The figures are fetched for one village's
-- map centre over the one-mile radius the API applies, so a row is the answer to
-- a question asked about that village and means nothing detached from it. Domain
-- rule 4 holds here the way it holds everywhere else, and `ON DELETE CASCADE`
-- matches `incidents`: a deleted village takes its cached figures with it.
--
-- ## The unique keys
--
-- `police_crimes_village_month_crime_key` is what makes a re-fetch idempotent.
-- A month is deleted and re-inserted inside one transaction — the upstream
-- figures are revised as investigations close, so a month is replaced wholesale
-- rather than merged — and this key is the backstop if two runs ever race. Both
-- halves matter: without it, two sync runs on the same village-month would
-- double every figure in a document sent to the police, which is the one failure
-- in this feature that would not look like one.
--
-- `police_data_syncs` is unique on `(village_id, month)` because it is the cache
-- record for exactly that pair. Its job is to tell "the police published nothing
-- for this month" apart from "we have never asked", which a count of rows in
-- `police_crimes` cannot do and which a report addressed to the police must not
-- get wrong.
--
-- ## After this runs
--
-- **Re-run `prisma/sql/rls_policies.sql`.** A new table arrives with RLS *off*
-- and every row readable by the anon key. That file now enables it on all three
-- and grants `authenticated` a village-scoped SELECT and nothing else — these
-- are written by a cron running as the table owner, so no client needs INSERT,
-- UPDATE or DELETE on any of them.
--
-- `prisma/sql/postgis.sql` does **not** need re-running. There is no geography
-- column here on purpose: nothing queries these tables by radius, because the
-- radius was applied upstream by the API when the month was fetched, so a
-- geography column and its trigger would be maintained for no reader.

-- CreateTable
CREATE TABLE "police_crimes" (
    "id" UUID NOT NULL,
    "village_id" UUID NOT NULL,
    "crime_id" TEXT NOT NULL,
    "persistent_id" TEXT,
    "month" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "street_id" INTEGER,
    "street_name" TEXT,
    "location_type" TEXT,
    "location_subtype" TEXT,
    "context" TEXT,
    "outcome_category" TEXT,
    "outcome_date" TEXT,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "police_crimes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "police_data_syncs" (
    "id" UUID NOT NULL,
    "village_id" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "crime_count" INTEGER NOT NULL,
    "detail" TEXT,
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "police_data_syncs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "police_neighbourhoods" (
    "id" UUID NOT NULL,
    "village_id" UUID NOT NULL,
    "force_id" TEXT NOT NULL,
    "force_name" TEXT,
    "neighbourhood_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "url_force" TEXT,
    "centre_lat" DOUBLE PRECISION,
    "centre_lng" DOUBLE PRECISION,
    "email" TEXT,
    "telephone" TEXT,
    "facebook" TEXT,
    "twitter" TEXT,
    "team" JSONB,
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "police_neighbourhoods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "police_crimes_village_id_month_idx" ON "police_crimes"("village_id", "month");

-- CreateIndex
CREATE INDEX "police_crimes_village_id_category_idx" ON "police_crimes"("village_id", "category");

-- CreateIndex
CREATE UNIQUE INDEX "police_crimes_village_month_crime_key" ON "police_crimes"("village_id", "month", "crime_id");

-- CreateIndex
CREATE INDEX "police_data_syncs_village_id_month_idx" ON "police_data_syncs"("village_id", "month" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "police_data_syncs_village_id_month_key" ON "police_data_syncs"("village_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "police_neighbourhoods_village_id_key" ON "police_neighbourhoods"("village_id");

-- CreateIndex
CREATE INDEX "police_neighbourhoods_force_id_neighbourhood_id_idx" ON "police_neighbourhoods"("force_id", "neighbourhood_id");

-- AddForeignKey
ALTER TABLE "police_crimes" ADD CONSTRAINT "police_crimes_village_id_fkey"
  FOREIGN KEY ("village_id") REFERENCES "villages"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "police_data_syncs" ADD CONSTRAINT "police_data_syncs_village_id_fkey"
  FOREIGN KEY ("village_id") REFERENCES "villages"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "police_neighbourhoods" ADD CONSTRAINT "police_neighbourhoods_village_id_fkey"
  FOREIGN KEY ("village_id") REFERENCES "villages"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
