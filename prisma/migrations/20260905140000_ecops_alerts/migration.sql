-- Police and Neighbourhood Watch bulletins, from Neighbourhood Alert ("eCops").
--
-- Two new tables and one nullable column on `villages`. Nothing a resident can
-- do changes because of this migration: no gate opens or closes, no report
-- moves, and every read added on top of these tables degrades to "no police
-- alerts" rather than failing. The column defaults to NULL, which means the
-- feature is off for every village until a coordinator turns it on — so
-- applying this changes nothing anybody can see until somebody asks it to.
--
-- ## What is stored, and why it is not personal data
--
-- Neighbourhood Alert is the platform most UK forces and Neighbourhood Watch
-- schemes publish their public bulletins through. A row here is a notice a
-- force sent to everybody subscribed to its portal — a scam warning, an appeal
-- for information, a PCSO drop-in. There is no victim, no suspect and no
-- reporter, and none of the domain rules that govern `incidents` has an
-- analogue, because there is nothing in these rows to restrict.
--
-- `sender_name` is the one column that names a person, and it names them in
-- their public office: the officer or coordinator whose byline is on the
-- bulletin, exactly as it appears on the force's own public page. It is the
-- same category as the names already held in `police_neighbourhoods.team`.
--
-- The message bodies arrive as HTML and are stored as **plain text, truncated**
-- — stripped in `src/lib/ecops/fetch-alerts.ts` before they ever reach here.
-- Two reasons, and both are load-bearing rather than tidy. This codebase
-- renders no third-party HTML anywhere, and the place to stop it is before
-- storage rather than at whichever component eventually reads the column. And
-- the feed carries a copyright line with no open licence, unlike data.police.uk
-- — so what is kept is an excerpt that always travels with a link back to the
-- original, which is the ordinary bargain of consuming somebody's RSS.
--
-- ## Why these are scoped by site and not by village
--
-- This is the one table pair in the schema that is not village-scoped, and the
-- departure is deliberate.
--
-- A Neighbourhood Alert *site* is a whole portal — Warwickshire Connected,
-- Hampshire Alert — which is a force area or a scheme, never a parish. The feed
-- offers no narrower filter that works: `AreaId` returns an empty channel for
-- every value tried inside a valid site. So a bulletin is not the answer to a
-- question asked about one village, the way a street-level crime figure is; it
-- is a county's notice, and ten thousand parishes served by one force would
-- otherwise hold ten thousand copies of it.
--
-- `villages.ecops_site_id` is the join, and `vw_current_ecops_site_id()` in
-- `prisma/sql/rls_policies.sql` is what keeps that safe through PostgREST — a
-- signed-in resident reads the alerts for their own village's site and no
-- other. **Re-run that file after this migration**: both tables arrive with RLS
-- off and every row readable by the anon key, and `villages` grants SELECT per
-- column, so `ecops_site_id` is invisible through PostgREST until it is named
-- there.
--
-- ## No geography, on purpose
--
-- There is no `lat`/`lng` here and no PostGIS column, because the feed
-- publishes no location of any kind — no coordinate, no postcode, no place
-- name. `prisma/sql/postgis.sql` does **not** need re-running.

-- --------------------------------------------------------------------------
-- villages
-- --------------------------------------------------------------------------

ALTER TABLE "villages" ADD COLUMN "ecops_site_id" INTEGER;

-- --------------------------------------------------------------------------
-- ecops_alerts
-- --------------------------------------------------------------------------

CREATE TABLE "ecops_alerts" (
    "id"           UUID         NOT NULL,
    "site_id"      INTEGER      NOT NULL,
    "external_id"  TEXT         NOT NULL,
    "title"        TEXT         NOT NULL,
    "summary"      TEXT         NOT NULL,
    "category"     TEXT,
    "sent_by"      TEXT,
    "sender_name"  TEXT,
    "link"         TEXT,
    "published_at" TIMESTAMP(3) NOT NULL,
    "fetched_at"   TIMESTAMP(3) NOT NULL,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ecops_alerts_pkey" PRIMARY KEY ("id")
);

-- Per site, not global. The feed's ids look globally unique today; a global
-- constraint would mean one site's fetch failing on a message another site had
-- already stored, and a shared id is not this table's business.
CREATE UNIQUE INDEX "ecops_alerts_site_external_key"
    ON "ecops_alerts" ("site_id", "external_id");

-- The only read there is: one site's alerts, newest first.
CREATE INDEX "ecops_alerts_site_id_published_at_idx"
    ON "ecops_alerts" ("site_id", "published_at" DESC);

-- --------------------------------------------------------------------------
-- ecops_site_syncs
-- --------------------------------------------------------------------------
--
-- One row per site, recording what the last read actually did. It exists
-- because an empty `ecops_alerts` cannot answer the question a coordinator will
-- ask: a site that published nothing, a site nobody has fetched yet, and a
-- SiteId somebody mistyped all look identical from the alerts table — and the
-- feed answers all three with 200 and a well-formed empty channel, so there is
-- no upstream error to lean on. `PoliceDataSync` exists for the same reason.

CREATE TABLE "ecops_site_syncs" (
    "site_id"         INTEGER      NOT NULL,
    "status"          TEXT         NOT NULL,
    "last_success_at" TIMESTAMP(3),
    "last_attempt_at" TIMESTAMP(3) NOT NULL,
    "item_count"      INTEGER      NOT NULL DEFAULT 0,
    "last_error"      TEXT,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ecops_site_syncs_pkey" PRIMARY KEY ("site_id")
);
