/**
 * Who counts as a platform administrator.
 *
 * **Server only** — `ADMIN_EMAILS` has no `NEXT_PUBLIC_` prefix, deliberately.
 * The list of people who can promote residents to coordinator is not something
 * to inline into every browser bundle, and anything that needs the answer in a
 * Client Component gets it as a prop computed on the server (see
 * `(app)/layout.tsx` handing `isAdmin` to `AppShell`).
 *
 * ## Why an environment variable rather than the `ADMIN` role
 *
 * Because of the bootstrap. `UserRole.ADMIN` exists in the schema and nothing
 * in the application ever sets it — the first administrator was an `UPDATE
 * users SET role = 'ADMIN'` typed into a SQL console, which is a poor way to
 * hold the one credential that can hand somebody the ability to read a
 * village's verbatim reports. A deployment's administrators are a deployment
 * decision, so they live where the other deployment decisions live: in the
 * environment, in Vercel's settings, changeable without a migration and
 * reviewable without a database.
 *
 * `UserRole.ADMIN` is **no longer what opens `/admin`**. It stays in the schema
 * because `vw_is_admin()` in `prisma/sql/rls_policies.sql` is defined against
 * it — those policies gate the `authenticated` PostgREST path, not the app's
 * own reads, and the app connects as the table owner. If you ever move the
 * runtime onto a request-scoped role, the two definitions have to be reconciled
 * and this comment is the warning that they are currently two.
 */

/**
 * Comma-separated, because a deployment has more than one administrator about
 * as often as it has one, and a second variable name is a worse answer than a
 * comma.
 *
 * Normalised to lower case and read once at module load: this is process
 * configuration, not per-request state.
 */
const ADMIN_EMAILS: readonly string[] = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((entry) => entry.trim().toLowerCase())
  .filter((entry) => entry.length > 0);

/**
 * False on a deployment that has not set the variable.
 *
 * With none set, **nobody is an administrator** and `/admin/coordinators`
 * refuses everyone. That is the right default for a fail-closed gate — the
 * alternative, treating "unset" as "anyone", is how an empty environment
 * variable becomes a public admin panel — but it does mean applications will
 * queue up unreviewed on a deployment that forgot this. `submitCoordinatorRequest`
 * logs when it cannot find anybody to tell.
 */
export const isAdminConfigured = ADMIN_EMAILS.length > 0;

/**
 * Whether this email address belongs to a platform administrator.
 *
 * Compared case-insensitively. Email addresses are case-insensitive in the part
 * that matters here, every provider treats them so, and an administrator typing
 * their own address with a capital letter into Vercel should not silently lose
 * access to the queue.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

/**
 * The configured addresses, for the one caller that needs to find these people
 * in the database rather than test one of them —
 * `notifyAdminsOfCoordinatorRequest`.
 */
export function adminEmails(): readonly string[] {
  return ADMIN_EMAILS;
}
