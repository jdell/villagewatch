import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

/**
 * `GET /api/health` — the endpoint an uptime monitor polls.
 *
 * Unauthenticated on purpose: a check that needed a credential is a check
 * somebody has to maintain a credential for, and everything it reports is
 * already public. The version is rendered in the public footer on every page.
 *
 * ## It is a readiness probe, not a liveness one
 *
 * The first version of this file returned `{ status: "ok" }` unconditionally.
 * That answers "is a lambda running", which is the question nobody is asking:
 * Next was serving the request, so of course one was. It would have gone on
 * answering 200 with Postgres unreachable and every page in the application
 * failing — a monitor that stays green through an outage is worse than no
 * monitor, because somebody is relying on it.
 *
 * So it touches the database. `SELECT 1` is the cheapest statement there is and
 * it exercises the part that actually breaks: the pooled connection through
 * `@prisma/adapter-pg`.
 *
 * ## Non-fatal, but not a 200
 *
 * The check cannot throw out of this handler — a health endpoint that 500s with
 * an HTML error page tells a monitor far less than one that answers. So the
 * query is wrapped, and a failure still produces a JSON body naming which check
 * failed.
 *
 * What it does **not** do is return 200 with `"status": "degraded"` in the body.
 * Most monitors are configured on the status code alone, so that shape is the
 * silent-failure version of this endpoint: green dashboard, dead application,
 * and the one line that says otherwise sitting in a body nobody parsed. 503 is
 * what a readiness probe returns when it is not ready, and it is what makes the
 * check worth having.
 *
 * ## Nothing about the failure crosses the boundary
 *
 * `detail` is a constant. A Prisma connection error's message can carry the
 * connection string, and this endpoint is unauthenticated — so the cause goes
 * to the server log and the caller gets a sentence. Same division
 * `notifyServerError` makes for Slack and `describeAuthError` makes for a
 * resident.
 */

/**
 * Never prerendered and never cached. Without this Next may answer from a
 * build-time render, which would freeze `checkedAt` at deploy time and report
 * a database that was reachable during the build. `/api/:path*` already carries
 * `Cache-Control: no-store` from `next.config.ts`, so nothing in front of this
 * caches it either.
 */
export const dynamic = "force-dynamic";

/** Prisma is a Node library; none of this would run on the edge. */
export const runtime = "nodejs";

type CheckState = "ok" | "failed" | "not_configured";

async function checkDatabase(): Promise<CheckState> {
  /*
    A fresh clone with no `DATABASE_URL` is a supported state — it is what lets
    the suite, the lint and the build run with no environment at all — and it is
    not an outage. Reported as its own value rather than as a failure, because a
    deployment that has never been configured and one whose database has fallen
    over want different people looking at them.
  */
  if (!process.env.DATABASE_URL) return "not_configured";

  try {
    await prisma.$queryRaw`SELECT 1`;
    return "ok";
  } catch (cause) {
    console.error("Health check: the database did not answer", cause);
    return "failed";
  }
}

export async function GET() {
  const database = await checkDatabase();
  const healthy = database !== "failed";

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      version: process.env.NEXT_PUBLIC_APP_VERSION || "unknown",
      checkedAt: new Date().toISOString(),
      checks: { database },
      /*
        A constant, and only when something is wrong. See the note above about
        what a Prisma error message can contain.
      */
      ...(healthy
        ? {}
        : { detail: "The database did not answer. See the server log." }),
    },
    { status: healthy ? 200 : 503 },
  );
}
