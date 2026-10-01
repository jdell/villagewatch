-- Scheduled police reports: three nullable columns on villages, null meaning
-- off. Nothing changes for any village until a coordinator sets a schedule.
--
-- None of the three is added to the `villages` SELECT grant in
-- `rls_policies.sql`, deliberately: `police_report_email` is a third party's
-- address, and the schedule is read only by the application. Because that
-- grant lists safe columns rather than revoking unsafe ones, leaving them out is
-- all it takes — re-running the file is not required for this migration.
ALTER TABLE "villages" ADD COLUMN "police_report_schedule" TEXT;
ALTER TABLE "villages" ADD COLUMN "police_report_email" TEXT;
ALTER TABLE "villages" ADD COLUMN "police_report_last_sent_at" TIMESTAMP(3);
