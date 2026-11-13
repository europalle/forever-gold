import { MARKET } from "@/config/player";
import { LAST_COLLECT_KEY, type LastCollect } from "../collector";
import { db } from "../db";
import { marketScope } from "../tsm";

// When each feed last brought something new, and when this user's addon last
// uploaded. Shown in the top bar so stale data is never a surprise.
export type Freshness = { label: string; at: Date | null; hint: string; text: string; stale: boolean };

export async function freshness(userId: string | null): Promise<Freshness[]> {
  const [market, depth, signal, addon, last] = await Promise.all([
    db.snapshot.findFirst({ where: { kind: "MARKET", scope: marketScope(MARKET) }, orderBy: { sourceUpdatedAt: "desc" }, select: { sourceUpdatedAt: true } }),
    db.depthSnapshot.findFirst({ orderBy: { lastModified: "desc" }, select: { lastModified: true } }),
    db.itemSignal.findFirst({ orderBy: { at: "desc" }, select: { at: true } }),
    userId ? db.character.findFirst({ where: { userId, addonAt: { not: null } }, orderBy: { addonAt: "desc" }, select: { addonAt: true } }) : null,
    db.setting.findUnique({ where: { key: LAST_COLLECT_KEY } }),
  ]);
  const run = (last?.value ?? null) as LastCollect | null;
  const failed = run?.results.filter((r) => r.status === "error") ?? [];
  const now = Date.now();
  const feeds = [
    { label: "Prices", at: market?.sourceUpdatedAt ?? null, staleAfterHours: 5, hint: "TSM's scan of your auction house, about every 3 hours" },
    { label: "Listings", at: depth?.lastModified ?? null, staleAfterHours: 3, hint: "Blizzard's listing of your auction house, hourly" },
    { label: "Signals", at: signal?.at ?? null, staleAfterHours: 4, hint: signal ? "When the calls were last rebuilt" : "No calls yet: an item needs 36 hours of price history" },
    { label: "Your addon", at: addon?.addonAt ?? null, staleAfterHours: 48, hint: "The last upload from the Forever Gold app: bags, skills, recipes" },
  ];
  feeds.unshift({
    label: "Collected",
    at: run ? new Date(run.at) : null,
    staleAfterHours: 2,
    hint: failed.length ? `Last run failed: ${failed.map((r) => `${r.kind} ${r.detail ?? ""}`).join("; ")}` : "The last hourly collection run",
  });
  return feeds.map((f) => ({
    label: f.label,
    at: f.at,
    hint: f.hint,
    text: f.label === "Collected" && failed.length ? `${ago(f.at, now)} ago, failed` : f.label === "Signals" && !f.at && run ? "waiting for history" : f.at ? `${ago(f.at, now)} ago` : "never",
    stale: !f.at || now - f.at.getTime() > f.staleAfterHours * 3_600_000 || (f.label === "Collected" && failed.length > 0),
  }));
}

export function ago(d: Date | null, now = Date.now()): string {
  if (!d) return "never";
  const m = Math.max(0, Math.round((now - d.getTime()) / 60_000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  if (m < 48 * 60) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}
