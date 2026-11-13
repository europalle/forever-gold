// Fills in what Blizzard's static game data knows: every profession's recipes
// with their reagents, and item icons. Runs in small timed batches after each
// collection, so it finishes over a day without anyone clicking anything, and
// from the Admin page for a bigger push.

import type { PrismaClient } from "@/generated/prisma/client";
import { blizzardConfigured, itemIcon, professionIndex, professionTiers, recipeDetail, staticNamespace, tierRecipes } from "./blizzard";

const INDEX_KEY = "recipeIndex"; // { at, status, recipes }
const INDEX_EVERY_MS = 7 * 86_400_000;
const ICON_RETRY_MS = 14 * 86_400_000;
const CONCURRENCY = 8;

export type StaticResult = { recipesListed: number; recipesFetched: number; recipesLeft: number; iconsFetched: number; iconsLeft: number; errors: string[]; namespace: string | null };

// Runs fn over items, a few at a time, until the deadline.
async function pool<T>(items: T[], deadline: number, fn: (item: T) => Promise<void>): Promise<number> {
  let i = 0;
  let done = 0;
  const worker = async () => {
    while (i < items.length && Date.now() < deadline) {
      const item = items[i++];
      await fn(item);
      done++;
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return done;
}

export async function importStatic(db: PrismaClient, budgetMs: number): Promise<StaticResult> {
  const out: StaticResult = { recipesListed: 0, recipesFetched: 0, recipesLeft: 0, iconsFetched: 0, iconsLeft: 0, errors: [], namespace: null };
  if (!blizzardConfigured()) {
    out.errors.push("Blizzard keys are not set");
    return out;
  }
  const deadline = Date.now() + budgetMs;
  const fail = (what: string) => {
    if (out.errors.length < 5 && !out.errors.includes(what)) out.errors.push(what);
  };

  // 1. The list of recipes, once a week.
  const index = await db.setting.findUnique({ where: { key: INDEX_KEY } });
  const indexAt = index ? new Date(String((index.value as { at?: string }).at)).getTime() : 0;
  if (Date.now() - indexAt > INDEX_EVERY_MS) {
    const idx = await professionIndex();
    if (idx.status !== 200) {
      fail(`profession list answered ${idx.status}`);
    } else {
      const rows: { id: number; profession: string; tier: string; category: string; name: string }[] = [];
      for (const p of idx.professions) {
        if (Date.now() > deadline) break;
        for (const t of await professionTiers(p.id)) {
          for (const r of await tierRecipes(p.id, t.id)) rows.push({ id: r.id, profession: p.name, tier: t.name, category: r.category, name: r.name });
        }
      }
      if (rows.length && Date.now() <= deadline) {
        await db.recipe.createMany({ data: rows, skipDuplicates: true });
        const value = { at: new Date().toISOString(), professions: idx.professions.length, recipes: rows.length };
        await db.setting.upsert({ where: { key: INDEX_KEY }, create: { key: INDEX_KEY, value }, update: { value } });
        out.recipesListed = rows.length;
      } else if (!rows.length) {
        fail(`${idx.professions.length} professions listed, but no recipes under them`);
      }
    }
  }

  // 2. Recipe details.
  const todo = await db.recipe.findMany({ where: { fetchedAt: null }, select: { id: true }, take: 2000 });
  out.recipesFetched = await pool(todo, deadline, async ({ id }) => {
    try {
      const d = await recipeDetail(id);
      if (d.status !== 200) return fail(`recipe ${id} answered ${d.status}`);
      await db.recipe.update({ where: { id }, data: { outputId: d.outputId, outputQty: d.outputQty, reagents: d.reagents, fetchedAt: new Date(), ...(d.name ? { name: d.name } : {}) } });
    } catch (e) {
      fail(`recipe ${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
  out.recipesLeft = await db.recipe.count({ where: { fetchedAt: null } });

  // 3. Icons, for items the site prices and has no icon for.
  const retry = new Date(Date.now() - ICON_RETRY_MS);
  const need = await db.$queryRaw<{ id: number }[]>`
    SELECT i.id FROM "Item" i LEFT JOIN "ItemInfo" ii ON ii.id = i.id
    WHERE ii.icon IS NULL AND (ii."iconTried" IS NULL OR ii."iconTried" < ${retry})
    ORDER BY i.id LIMIT 3000`;
  out.iconsFetched = await pool(need, deadline, async ({ id }) => {
    try {
      const r = await itemIcon(id);
      if (r.status !== 200 && r.status !== 404) return fail(`icon ${id} answered ${r.status}`);
      await db.itemInfo.upsert({ where: { id }, create: { id, icon: r.url, iconTried: new Date() }, update: { icon: r.url, iconTried: new Date() } });
    } catch (e) {
      fail(`icon ${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
  const [left] = await db.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM "Item" i LEFT JOIN "ItemInfo" ii ON ii.id = i.id
    WHERE ii.icon IS NULL AND (ii."iconTried" IS NULL OR ii."iconTried" < ${retry})`;
  out.iconsLeft = left?.n ?? 0;
  out.namespace = staticNamespace();
  return out;
}

export const staticSummary = (r: StaticResult) =>
  [
    r.recipesListed ? `${r.recipesListed} recipes listed` : null,
    `${r.recipesFetched} recipes read, ${r.recipesLeft} left`,
    `${r.iconsFetched} icons read, ${r.iconsLeft} left`,
    r.namespace ? `namespace ${r.namespace}` : null,
    r.errors.length ? `errors: ${r.errors.join("; ")}` : null,
  ]
    .filter(Boolean)
    .join(", ");
