import { collectAll } from "@/lib/collector";
import { cronAuthorized } from "@/lib/cron-auth";
import { db } from "@/lib/db";

// Called by a scheduler with "Authorization: Bearer <CRON_SECRET>": cron-job.org
// every hour (see docs/setup.md), GitHub Actions as a backup. Each scan is stored
// once, so overlapping calls are harmless. A run takes about 2 seconds.
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    // Say so plainly: the usual cause is a variable added after the deploy.
    return Response.json({ error: "CRON_SECRET is not set on this deployment" }, { status: 401 });
  }
  if (!cronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "Authorization header does not match CRON_SECRET" }, { status: 401 });
  }
  const results = await collectAll(db);
  const failed = results.some((r) => r.status === "error");
  return Response.json({ results }, { status: failed ? 502 : 200 });
}
