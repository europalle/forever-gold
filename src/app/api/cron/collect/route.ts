import { collectAll } from "@/lib/collector";
import { db } from "@/lib/db";

// Called by a scheduler with "Authorization: Bearer <CRON_SECRET>": cron-job.org
// every hour (see docs/setup.md), GitHub Actions as a backup. Each scan is stored
// once, so overlapping calls are harmless. A run takes about 2 seconds.
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const results = await collectAll(db);
  const failed = results.some((r) => r.status === "error");
  return Response.json({ results }, { status: failed ? 502 : 200 });
}
