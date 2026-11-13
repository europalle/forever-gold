// Craft profit for any recipe at today's prices. Pure.
//   cost    = each reagent at the cheaper of the auction house and a vendor
//   revenue = what the output's cheapest listing pays after the cut
// A recipe with a reagent nobody sells has no cost and is left out.

export type CraftRecipe = { key: string; profession: string; name: string; outputId: number; outputQty: number; reagents: [number, number][]; known: boolean; source: "blizzard" | "addon" };
export type CraftRow = CraftRecipe & {
  cost: number;
  revenue: number;
  profit: number;
  margin: number; // profit over cost
  outPrice: number;
  soldHere: number | null; // output units sold a day on this auction house
  perDay: number | null; // profit a day if you supplied a tenth of what sells
  vendorParts: number; // how many reagents are cheapest at a vendor
};

export type CraftPrices = {
  ah: Map<number, number>; // cheapest listing per unit
  vendor: Map<number, number>; // vendor price per unit
  soldHere: Map<number, number>;
};

export function craftRows(recipes: CraftRecipe[], p: CraftPrices, cut: number): CraftRow[] {
  const out: CraftRow[] = [];
  for (const r of recipes) {
    const outPrice = p.ah.get(r.outputId);
    if (!outPrice || !r.reagents.length) continue;
    let cost = 0;
    let vendorParts = 0;
    let priced = true;
    for (const [id, qty] of r.reagents) {
      const a = p.ah.get(id);
      const v = p.vendor.get(id);
      const unit = a != null && v != null ? Math.min(a, v) : (a ?? v);
      if (unit == null) {
        priced = false;
        break;
      }
      if (v != null && (a == null || v <= a)) vendorParts++;
      cost += unit * qty;
    }
    if (!priced || cost <= 0) continue;
    // Rounded first, so profit is exactly the two figures shown.
    cost = Math.round(cost);
    const revenue = Math.round(outPrice * r.outputQty * (1 - cut));
    const profit = revenue - cost;
    const sold = p.soldHere.get(r.outputId) ?? null;
    out.push({
      ...r,
      cost,
      revenue,
      profit,
      margin: profit / cost,
      outPrice,
      soldHere: sold,
      perDay: sold != null ? Math.round((profit * sold * 0.1) / r.outputQty) : null,
      vendorParts,
    });
  }
  return out;
}

// One row per output and profession: a learned recipe wins, then the cheaper one.
export function dedupeCrafts(rows: CraftRow[]): CraftRow[] {
  const best = new Map<string, CraftRow>();
  for (const r of rows) {
    const k = `${r.profession}:${r.outputId}`;
    const b = best.get(k);
    if (!b || (r.known && !b.known) || (r.known === b.known && r.cost < b.cost)) best.set(k, r);
  }
  return [...best.values()];
}
