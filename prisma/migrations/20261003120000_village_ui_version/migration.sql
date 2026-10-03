-- The village-level UI version flag: `classic` or `modern`, for trying the
-- redesign one village at a time.
--
-- One column, defaulting to `classic`, so every existing village carries on
-- exactly as it was and nothing a resident sees changes when this lands. No
-- CHECK constraint, matching `privacy_level`: the application narrows the value
-- (`resolveUiVersion`) and falls back to `classic` for anything it does not
-- recognise.
--
-- **Re-run `prisma/sql/rls_policies.sql` after this migration.** `villages`
-- grants SELECT per column, so `ui_version` is invisible through PostgREST until
-- it is named there. `postgis.sql` need not be re-run.

ALTER TABLE "villages" ADD COLUMN "ui_version" TEXT NOT NULL DEFAULT 'classic';
