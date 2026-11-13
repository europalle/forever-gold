import { after } from "next/server";
import { collectAll } from "@/lib/collector";
import { cronAuthorized } from "@/lib/cron-auth";
import { db } from "@/lib/db";

// Called by a scheduler with "Authorization: Bearer <CRON_SECRET>": cron-job.org
// every hour (see docs/setup.md), GitHub Actions as a backup. Each scan is stored
// once, so overlapping calls are harmless. A run takes about 2 seconds.
// TSM files take about 2 seconds; Blizzard's two listings (about 9 MB each) longer.
export const maxDuration = 180;

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    // Say so plainly: the usual cause is a variable added after the deploy.
    return Response.json({ error: "CRON_SECRET is not set on this deployment" }, { status: 401 });
  }
  if (!cronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "Authorization header does not match CRON_SECRET" }, { status: 401 });
  }
  // cron-job.org gives up after 30 seconds and switches a job off after
  // repeated failures, and a run with Blizzard's listings takes longer. So the
  // scheduler gets its answer at once and the work carries on after it; the
  // result is on the Admin page. "?wait=1" runs it inline, for a manual check.
  if (new URL(request.url).searchParams.get("wait") === "1") {
    const results = await collectAll(db);
    const failed = results.some((r) => r.status === "error");
    return Response.json({ results }, { status: failed ? 502 : 200 });
  }
  after(async () => {
    await collectAll(db);
  });
  return Response.json({ started: true, note: "Collecting in the background. Results: Admin page, Collection." }, { status: 202 });
}
