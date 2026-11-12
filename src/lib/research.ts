// Summaries of what members' addons recorded. Pure: rows in, tables out.

export type Drop = { itemId: number; share: number; avgQty: number };

export type LootRow = {
  npcId: number | null;
  npcName: string | null;
  npcLevel: number | null;
  sourceItemId: number | null;
  items: [number, number][];
};

function summarise(rows: LootRow[]): Drop[] {
  const seen = new Map<number, { events: number; qty: number }>();
  for (const r of rows) {
    const inThis = new Map<number, number>();
    for (const [id, q] of r.items) inThis.set(id, (inThis.get(id) ?? 0) + q);
    for (const [id, q] of inThis) {
      const s = seen.get(id) ?? { events: 0, qty: 0 };
      s.events++;
      s.qty += q;
      seen.set(id, s);
    }
  }
  return [...seen.entries()]
    .map(([itemId, s]) => ({ itemId, share: s.events / rows.length, avgQty: s.qty / s.events }))
    .sort((a, b) => b.share - a.share);
}

// Level brackets as in the research table: 1-10, then steps of five.
export function bracketOf(level: number): string {
  if (level <= 10) return "1-10";
  const lo = Math.floor((level - 1) / 5) * 5 + 1;
  return `${lo}-${lo + 4}`;
}

export type ItemFacts = { quality: number | null; classId: number | null; reqLevel: number | null; itemLevel: number | null };

export type DisenchantGroup = { quality: number; type: "armor" | "weapon"; bracket: string; level: number; n: number; drops: Drop[] };

// Disenchants grouped by source quality, armor or weapon, and required level
// (item level when an item has none). Events with an unknown source are left out.
export function disenchantTable(rows: LootRow[], facts: Map<number, ItemFacts>): DisenchantGroup[] {
  const groups = new Map<string, { g: Omit<DisenchantGroup, "n" | "drops">; rows: LootRow[] }>();
  for (const r of rows) {
    const f = r.sourceItemId ? facts.get(r.sourceItemId) : undefined;
    if (!f || f.quality === null || (f.classId !== 2 && f.classId !== 4)) continue;
    const level = f.reqLevel || f.itemLevel;
    if (!level) continue;
    const type = f.classId === 2 ? "weapon" : "armor";
    const bracket = bracketOf(level);
    const key = `${f.quality}|${type}|${bracket}`;
    const lo = Number(bracket.split("-")[0]);
    const e = groups.get(key) ?? { g: { quality: f.quality, type, bracket, level: lo }, rows: [] };
    e.rows.push(r);
    groups.set(key, e);
  }
  return [...groups.values()]
    .map(({ g, rows }) => ({ ...g, n: rows.length, drops: summarise(rows) }))
    .sort((a, b) => a.quality - b.quality || a.level - b.level || a.type.localeCompare(b.type));
}

export type MobYield = { npcId: number; name: string | null; levels: [number, number] | null; n: number; drops: Drop[] };

// Yield per mob (skinning, herbs, ore, fishing), most-sampled first.
export function yieldTable(rows: LootRow[], minSamples = 1): MobYield[] {
  const by = new Map<number, LootRow[]>();
  for (const r of rows) {
    if (!r.npcId) continue;
    const list = by.get(r.npcId) ?? [];
    list.push(r);
    by.set(r.npcId, list);
  }
  return [...by.entries()]
    .filter(([, list]) => list.length >= minSamples)
    .map(([npcId, list]) => {
      const lv = list.map((r) => r.npcLevel).filter((x): x is number => x !== null);
      return {
        npcId,
        name: list.map((r) => r.npcName).find((x) => x) ?? null,
        levels: lv.length ? ([Math.min(...lv), Math.max(...lv)] as [number, number]) : null,
        n: list.length,
        drops: summarise(list),
      };
    })
    .sort((a, b) => b.n - a.n);
}

export type VendorFlip = { itemId: number; vendor: string | null; unitCost: number; cheapest: number; profit: number; stock: number | null };

// Vendor items the auction house pays more for, after the cut.
export function vendorFlips(
  items: { itemId: number; vendorName: string | null; price: number; stack: number; stock: number | null; extended: boolean }[],
  cheapest: Map<number, number>,
  cut: number,
  minProfit = 20,
): VendorFlip[] {
  const best = new Map<number, VendorFlip>();
  for (const v of items) {
    if (v.extended) continue;
    const ah = cheapest.get(v.itemId);
    if (!ah) continue;
    const unitCost = v.price / Math.max(1, v.stack);
    const profit = Math.round(ah * (1 - cut) - unitCost);
    if (profit < minProfit) continue;
    const prev = best.get(v.itemId);
    if (!prev || profit > prev.profit) best.set(v.itemId, { itemId: v.itemId, vendor: v.vendorName, unitCost, cheapest: ah, profit, stock: v.stock });
  }
  return [...best.values()].sort((a, b) => b.profit - a.profit);
}
