import { collectAll } from "@/lib/collector";
import { db } from "@/lib/db";

// Called by a scheduler with "Authorization: Bearer <CRON_SECRET>".
// Vercel Cron sends that header itself when CRON_SECRET is set.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const results = await collectAll(db);
  const failed = results.some((r) => r.status === "error");
  return Response.json({ results }, { status: failed ? 502 : 200 });
}
