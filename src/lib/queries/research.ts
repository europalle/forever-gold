import { MARKET } from "@/config/player";
import { SETTINGS } from "@/config/settings";
import { db } from "../db";
import { disenchantTable, vendorFlips, yieldTable, type ItemFacts, type LootRow } from "../research";
import { marketScope } from "../tsm";

// Everything here is pooled across the guild: drop rates and vendor prices are
// game facts, and more players means better numbers. Nothing personal is shown.

const asRows = (rows: { npcId: number | null; npcName: string | null; npcLevel: number | null; sourceItemId: number | null; items: unknown }[]): LootRow[] =>
  rows.map((r) => ({ ...r, items: (Array.isArray(r.items) ? r.items : []) as [number, number][] }));

export async function itemNames(ids: number[]): Promise<Map<number, string>> {
  if (!ids.length) return new Map();
  const [items, infos] = await Promise.all([
    db.item.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    db.itemInfo.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
  ]);
  const m = new Map<number, string>();
  for (const i of infos) if (i.name) m.set(i.id, i.name);
  for (const i of items) if (i.name) m.set(i.id, i.name);
  return m;
}

export async function disenchantResearch() {
  const rows = await db.lootEvent.findMany({
    where: { kind: "disenchant", sourceItemId: { not: null } },
    select: { npcId: true, npcName: true, npcLevel: true, sourceItemId: true, items: true },
  });
  const srcIds = [...new Set(rows.map((r) => r.sourceItemId!))];
  const facts = await db.itemInfo.findMany({
    where: { id: { in: srcIds } },
    select: { id: true, quality: true, classId: true, reqLevel: true, itemLevel: true },
  });
  const table = disenchantTable(asRows(rows), new Map<number, ItemFacts>(facts.map((f) => [f.id, f])));
  const names = await itemNames([...new Set(table.flatMap((g) => g.drops.map((d) => d.itemId)))]);
  return { total: rows.length, table, names };
}

export async function yieldResearch(kind: string) {
  const rows = await db.lootEvent.findMany({
    where: { kind },
    select: { npcId: true, npcName: true, npcLevel: true, sourceItemId: true, items: true },
  });
  const table = yieldTable(asRows(rows)).slice(0, 40);
  const names = await itemNames([...new Set(table.flatMap((m) => m.drops.map((d) => d.itemId)))]);
  return { total: rows.length, table, names };
}

export async function vendorResearch() {
  const latest = await db.snapshot.findFirst({ where: { kind: "MARKET", scope: marketScope(MARKET) }, orderBy: { sourceUpdatedAt: "desc" } });
  const items = await db.vendorItem.findMany();
  const prices = latest
    ? await db.marketPrice.findMany({
        where: { snapshotId: latest.id, itemId: { in: [...new Set(items.map((i) => i.itemId))] }, minBuyout: { not: null } },
        select: { itemId: true, minBuyout: true },
      })
    : [];
  const flips = vendorFlips(items, new Map(prices.map((p) => [p.itemId, p.minBuyout!])), SETTINGS.cut);
  const names = await itemNames(flips.map((f) => f.itemId));
  return { vendors: new Set(items.map((i) => i.npcId)).size, items: items.length, flips, names };
}

export async function trainerResearch() {
  const services = await db.trainerService.findMany({ orderBy: [{ skill: "asc" }, { skillLevel: "asc" }, { name: "asc" }] });
  return services;
}
