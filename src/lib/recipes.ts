// Replaces the built-in conversions' Classic Era reagents with the recipes a
// user's characters actually have, as the addon read them from the profession
// window. Pure: conversions and recipes in, conversions out.

import type { Conversion } from "@/config/items";

export type KnownRecipe = { out: number | null; qty: number | null; reag: [number, number][]; learned: boolean };

export function applyRecipes(conversions: Conversion[], recipes: KnownRecipe[]): Conversion[] {
  const byOutput = new Map<number, KnownRecipe>();
  for (const r of recipes) {
    if (!r.out) continue;
    const prev = byOutput.get(r.out);
    if (!prev || (r.learned && !prev.learned)) byOutput.set(r.out, r);
  }
  return conversions.map((c) => {
    const r = byOutput.get(c.output.id);
    if (!r) return c;
    const own = r.reag.find(([id]) => id === c.from.id);
    if (!own) return c; // the game's recipe does not use this item at all
    return {
      ...c,
      from: { id: c.from.id, qty: own[1] },
      extras: r.reag.filter(([id]) => id !== c.from.id).map(([id, qty]) => ({ id, qty })),
      output: { id: c.output.id, qty: r.qty ?? c.output.qty },
      verified: true,
      known: r.learned,
    };
  });
}

// All recipes in a user's characters' JSON, from the addon.
export function recipesFromCharacters(chars: { recipes: unknown }[]): KnownRecipe[] {
  const out: KnownRecipe[] = [];
  for (const c of chars) {
    for (const prof of Object.values((c.recipes ?? {}) as Record<string, Record<string, Record<string, unknown>>>)) {
      for (const r of Object.values(prof ?? {})) {
        const reag = Array.isArray(r.reag) ? (r.reag as unknown[]).filter((x): x is [number, number] => Array.isArray(x) && x.length === 2) : [];
        out.push({
          out: typeof r.out === "number" ? r.out : null,
          qty: typeof r.qty === "number" ? r.qty : null,
          reag,
          learned: r.l === 1 || r.l === undefined, // older addon versions only sent learned recipes
        });
      }
    }
  }
  return out;
}
