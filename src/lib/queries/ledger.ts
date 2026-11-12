import { MARKET } from "@/config/player";
import { SETTINGS } from "@/config/settings";
import { db } from "../db";
import { byItem, totals, type ItemStats, type Totals } from "../ledger";
import { marketScope } from "../tsm";

export type LedgerView = {
  lastUpload: Date | null;
  week: Totals;
  all: Totals;
  firstRow: Date | null;
  characters: { name: string; money: number | null; classKey: string | null; gold: { at: Date; copper: number }[] }[];
  items: (ItemStats & { name: string; cheapestNow: number | null })[];
  recent: { kind: string; character: string; name: string; quantity: number; unitPrice: number; amount: number; detail: string; time: Date }[];
};

export async function ledgerView(userId: string): Promise<LedgerView> {
  const [rows, upload, characters, gold, latest] = await Promise.all([
    db.ledgerEntry.findMany({
      where: { userId },
      select: { kind: true, itemId: true, quantity: true, unitPrice: true, amount: true, time: true, character: true, detail: true },
      orderBy: { time: "desc" },
    }),
    db.upload.findFirst({ where: { userId, kind: "tsm" }, orderBy: { at: "desc" }, select: { at: true } }),
    db.character.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    db.goldSample.findMany({ where: { userId }, orderBy: { at: "asc" }, select: { character: true, at: true, copper: true } }),
    db.snapshot.findFirst({ where: { kind: "MARKET", scope: marketScope(MARKET) }, orderBy: { sourceUpdatedAt: "desc" }, select: { id: true } }),
  ]);

  const stats = byItem(rows).slice(0, 30);
  const ids = [...new Set([...stats.map((s) => s.itemId), ...rows.slice(0, 40).flatMap((r) => (r.itemId ? [r.itemId] : []))])];
  const [names, prices] = await Promise.all([
    db.item.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    latest
      ? db.marketPrice.findMany({ where: { snapshotId: latest.id, itemId: { in: ids } }, select: { itemId: true, minBuyout: true } })
      : [],
  ]);
  const nameOf = new Map(names.map((n) => [n.id, n.name || `Item ${n.id}`]));
  const priceOf = new Map(prices.map((p) => [p.itemId, p.minBuyout]));
  const label = (id: number | null, detail: string) => (id ? (nameOf.get(id) ?? `Item ${id}`) : detail);

  return {
    lastUpload: upload?.at ?? null,
    week: totals(rows, SETTINGS.cut, new Date(Date.now() - 7 * 86_400_000)),
    all: totals(rows, SETTINGS.cut),
    firstRow: rows.length ? rows[rows.length - 1].time : null,
    characters: characters.map((c) => ({
      name: c.name,
      money: c.money,
      classKey: c.classKey,
      gold: gold.filter((g) => g.character === c.name).map((g) => ({ at: g.at, copper: g.copper })),
    })),
    items: stats.map((s) => ({ ...s, name: nameOf.get(s.itemId) ?? `Item ${s.itemId}`, cheapestNow: priceOf.get(s.itemId) ?? null })),
    recent: rows.slice(0, 40).map((r) => ({
      kind: r.kind,
      character: r.character,
      name: label(r.itemId, r.detail),
      quantity: r.quantity,
      unitPrice: r.unitPrice,
      amount: r.amount,
      detail: r.detail,
      time: r.time,
    })),
  };
}

// Highest skill per profession across a user's characters, from TSM uploads.
export async function skillsFor(userId: string): Promise<Record<string, number>> {
  const chars = await db.character.findMany({ where: { userId }, select: { professions: true } });
  const out: Record<string, number> = {};
  for (const c of chars) {
    for (const [prof, p] of Object.entries((c.professions ?? {}) as Record<string, { level?: number }>)) {
      out[prof] = Math.max(out[prof] ?? 0, p.level ?? 0);
    }
  }
  return out;
}
