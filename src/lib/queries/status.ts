import { MARKET } from "@/config/player";
import { db } from "../db";
import { marketScope } from "../tsm";

// When each feed last brought something new, and when this user's addon last
// uploaded. Shown in the top bar so stale data is never a surprise.
export type Freshness = { label: string; at: Date | null; hint: string; text: string; stale: boolean };

export async function freshness(userId: string | null): Promise<Freshness[]> {
  const [market, depth, signal, addon] = await Promise.all([
    db.snapshot.findFirst({ where: { kind: "MARKET", scope: marketScope(MARKET) }, orderBy: { sourceUpdatedAt: "desc" }, select: { sourceUpdatedAt: true } }),
    db.depthSnapshot.findFirst({ orderBy: { lastModified: "desc" }, select: { lastModified: true } }),
    db.itemSignal.findFirst({ orderBy: { at: "desc" }, select: { at: true } }),
    userId ? db.character.findFirst({ where: { userId, addonAt: { not: null } }, orderBy: { addonAt: "desc" }, select: { addonAt: true } }) : null,
  ]);
  const now = Date.now();
  const feeds = [
    { label: "Prices", at: market?.sourceUpdatedAt ?? null, staleAfterHours: 5, hint: "TSM's scan of your auction house, about every 3 hours" },
    { label: "Listings", at: depth?.lastModified ?? null, staleAfterHours: 3, hint: "Blizzard's listing of your auction house, hourly" },
    { label: "Signals", at: signal?.at ?? null, staleAfterHours: 4, hint: "When the calls were last rebuilt" },
    { label: "Your addon", at: addon?.addonAt ?? null, staleAfterHours: 48, hint: "The last upload from the Forever Gold app: bags, skills, recipes" },
  ];
  return feeds.map((f) => ({
    label: f.label,
    at: f.at,
    hint: f.hint,
    text: f.at ? `${ago(f.at, now)} ago` : "never",
    stale: !f.at || now - f.at.getTime() > f.staleAfterHours * 3_600_000,
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
