// Turns Blizzard auction listings into per-item depth, and scores how well a
// house's prices match TSM's for our market. Pure, so it is tested offline.

export type RawAuction = {
  item?: { id?: number };
  quantity?: number;
  unit_price?: number; // commodities: copper per unit
  buyout?: number; // item auctions: per unit or per stack, see buyoutPerUnit
  bid?: number;
};

export type Depth = {
  itemId: number;
  minUnit: number;
  qtyAtMin: number;
  qtyNearMin: number;
  totalQty: number;
  auctions: number;
  ladder: [number, number][];
};

const LADDER_STEPS = 8;

// Unit price of a listing, or null for bid-only auctions.
export function unitPrice(a: RawAuction, buyoutPerUnit: boolean): number | null {
  if (typeof a.unit_price === "number") return a.unit_price;
  if (typeof a.buyout !== "number" || a.buyout <= 0) return null;
  const q = Math.max(1, a.quantity ?? 1);
  return buyoutPerUnit ? a.buyout : Math.round(a.buyout / q);
}

export function depthFrom(auctions: RawAuction[], buyoutPerUnit: boolean): Map<number, Depth> {
  const levels = new Map<number, Map<number, number>>(); // item -> unit price -> quantity
  const counts = new Map<number, number>();
  for (const a of auctions) {
    const id = a.item?.id;
    if (typeof id !== "number") continue;
    const unit = unitPrice(a, buyoutPerUnit);
    if (unit === null || unit <= 0 || unit > 2_147_483_647) continue;
    const q = Math.max(1, a.quantity ?? 1);
    let m = levels.get(id);
    if (!m) levels.set(id, (m = new Map()));
    m.set(unit, (m.get(unit) ?? 0) + q);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const out = new Map<number, Depth>();
  for (const [itemId, m] of levels) {
    const steps = [...m.entries()].sort((a, b) => a[0] - b[0]);
    const [minUnit, qtyAtMin] = steps[0];
    let near = 0;
    let total = 0;
    for (const [p, q] of steps) {
      total += q;
      if (p <= minUnit * 1.05) near += q;
    }
    out.set(itemId, { itemId, minUnit, qtyAtMin, qtyNearMin: near, totalQty: total, auctions: counts.get(itemId)!, ladder: steps.slice(0, LADDER_STEPS) });
  }
  return out;
}

// Share of shared items whose cheapest price agrees with TSM's within 3%.
// Timing differs (TSM scans every few hours), so a perfect score is not expected;
// the right house still scores far above the others.
export function matchScore(depth: Map<number, Depth>, tsmMin: Map<number, number>): { score: number; compared: number } {
  let compared = 0;
  let agree = 0;
  for (const [id, d] of depth) {
    const t = tsmMin.get(id);
    if (!t) continue;
    compared++;
    if (Math.abs(d.minUnit - t) <= Math.max(1, t * 0.03)) agree++;
  }
  return { score: compared ? agree / compared : 0, compared };
}

// Whether item auctions' buyout is per unit: try both readings on stacked item
// auctions only and keep the one that agrees with TSM more often.
export function decideBuyoutPerUnit(itemAuctions: RawAuction[], tsmMin: Map<number, number>): { perUnit: boolean; stacked: number; perUnitScore: number; perStackScore: number } {
  const stacked = itemAuctions.filter((a) => (a.quantity ?? 1) > 1 && typeof a.buyout === "number");
  const a = matchScore(depthFrom(stacked, true), tsmMin);
  const b = matchScore(depthFrom(stacked, false), tsmMin);
  return { perUnit: a.score > b.score, stacked: stacked.length, perUnitScore: a.score, perStackScore: b.score };
}
