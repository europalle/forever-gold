import { MARKET } from "@/config/player";
import { SETTINGS } from "@/config/settings";
import { realmSales } from "../blizzard-collect";
import { craftRows, dedupeCrafts, type CraftRecipe, type CraftRow } from "../crafting";
import { db } from "../db";
import { marketScope } from "../tsm";
import { itemMeta, type ItemMeta } from "./market";

export type CraftView = {
  professions: { name: string; recipes: number; mine: number | null }[]; // mine: the user's skill, if they have it
  rows: (CraftRow & { skillOk: boolean })[];
  names: Map<number, string>;
  meta: Map<number, ItemMeta>;
  total: number;
  fromBlizzard: number;
  measured: boolean;
  vendor: Map<number, number>; // vendor price per unit, where the guild has seen one
};

// Every recipe the site knows: Blizzard's, plus those the guild's addons read
// from profession windows (which also tell who has learned what).
export async function craftView(userId: string, profession: string | null, onlyMine: boolean, limit = 60): Promise<CraftView> {
  const scope = marketScope(MARKET);
  const latest = await db.snapshot.findFirst({ where: { kind: "MARKET", scope }, orderBy: { sourceUpdatedAt: "desc" } });
  const [blizz, chars, mine, prices, vendor, here] = await Promise.all([
    db.recipe.findMany({ where: { fetchedAt: { not: null }, outputId: { not: null } } }),
    db.character.findMany({ select: { userId: true, recipes: true } }),
    db.character.findMany({ where: { userId }, select: { professions: true } }),
    latest ? db.marketPrice.findMany({ where: { snapshotId: latest.id, minBuyout: { not: null } }, select: { itemId: true, minBuyout: true } }) : [],
    db.vendorItem.findMany({ where: { extended: false }, select: { itemId: true, price: true, stack: true } }),
    realmSales(db),
  ]);

  const skills = new Map<string, number>();
  for (const c of mine) {
    for (const [prof, v] of Object.entries((c.professions ?? {}) as Record<string, { level?: number; lvl?: number }>)) {
      skills.set(prof, Math.max(skills.get(prof) ?? 0, v.level ?? v.lvl ?? 0));
    }
  }

  const recipes: CraftRecipe[] = blizz.map((r) => ({
    key: `b${r.id}`,
    profession: r.profession,
    name: r.name,
    outputId: r.outputId!,
    outputQty: r.outputQty,
    reagents: r.reagents as [number, number][],
    known: false,
    source: "blizzard" as const,
  }));
  for (const c of chars) {
    for (const [prof, list] of Object.entries((c.recipes ?? {}) as Record<string, Record<string, { name?: string; out?: number; qty?: number; reag?: [number, number][]; l?: boolean | number }>>)) {
      for (const [id, r] of Object.entries(list ?? {})) {
        if (typeof r.out !== "number" || !Array.isArray(r.reag) || !r.reag.length) continue;
        recipes.push({
          key: `a${prof}${id}`,
          profession: prof,
          name: r.name ?? `Recipe ${id}`,
          outputId: r.out,
          outputQty: r.qty && r.qty > 0 ? r.qty : 1,
          reagents: r.reag.filter((x) => Array.isArray(x) && x.length === 2),
          known: c.userId === userId && !!r.l,
          source: "addon",
        });
      }
    }
  }

  const vendorBy = new Map<number, number>();
  for (const v of vendor) {
    const unit = v.price / Math.max(1, v.stack);
    if (!vendorBy.has(v.itemId) || unit < vendorBy.get(v.itemId)!) vendorBy.set(v.itemId, unit);
  }
  const all = dedupeCrafts(craftRows(recipes, { ah: new Map(prices.map((x) => [x.itemId, x.minBuyout!])), vendor: vendorBy, soldHere: here.perDay }, SETTINGS.cut));

  const count = new Map<string, number>();
  for (const r of all) count.set(r.profession, (count.get(r.profession) ?? 0) + 1);
  const professions = [...count.entries()].map(([name, n]) => ({ name, recipes: n, mine: skills.get(name) ?? null })).sort((a, b) => Number(b.mine != null) - Number(a.mine != null) || a.name.localeCompare(b.name));

  let rows = all.filter((r) => (!profession || r.profession === profession) && (!onlyMine || r.known));
  // Rank by gold a day where sales are measured, else by profit each; losses last.
  rows.sort((a, b) => (b.perDay ?? b.profit) - (a.perDay ?? a.profit));
  const total = rows.length;
  rows = rows.slice(0, limit);
  const ids = [...new Set(rows.flatMap((r) => [r.outputId, ...r.reagents.map(([id]) => id)]))];
  const [items, meta] = await Promise.all([db.item.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }), itemMeta(ids)]);
  return {
    professions,
    rows: rows.map((r) => ({ ...r, skillOk: r.known || skills.has(r.profession) })),
    names: new Map(items.map((i) => [i.id, i.name])),
    meta,
    total,
    fromBlizzard: blizz.length,
    measured: here.perDay.size > 0,
    vendor: vendorBy,
  };
}
