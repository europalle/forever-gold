// The sell, cure, combine or hold call for one item. Pure: prices in, call out.

import type { Conversion } from "@/config/items";
import type { Settings } from "@/config/settings";

export type Quote = {
  minBuyout: number | null; // cheapest listing now, copper per unit
  marketValue: number | null;
  historical: number | null; // TSM's longer average: "usual price"
  saleRate: number | null; // region, 0 to 1
  soldPerDay: number | null; // region
  trend?: number | null; // market value change over the trend window, as a share
  trendHours?: number; // how long that window is
};

export type Call =
  | { kind: "no-data"; reason: string }
  | { kind: "sell"; price: number; net: number; reason: string; slow: boolean }
  | { kind: "hold"; reason: string }
  | { kind: "convert"; verb: Conversion["verb"]; outputId: number; gainPerUnit: number; reason: string };

// The price you would post at: match the cheapest listing, or market value if
// nothing is listed.
export function postPrice(q: Quote): number | null {
  return q.minBuyout ?? q.marketValue;
}

// What one unit brings in after the cut and the expected deposit loss. The
// deposit is lost when the listing expires, so weigh it by the chance it does.
export function netPerUnit(q: Quote, s: Settings): number | null {
  const price = postPrice(q);
  if (price === null) return null;
  const expireChance = 1 - (q.saleRate ?? 0.5);
  const depositLoss = (s.depositPerListing * expireChance) / s.lotSize;
  return price * (1 - s.cut) - depositLoss;
}

// Gain per unit of `from` when converting instead of selling `from` raw.
// Extras are bought at their cheapest listing. Null when a price is missing.
export function conversionGain(
  conv: Conversion,
  quotes: Map<number, Quote>,
  s: Settings,
): { gainPerUnit: number; rawNet: number; outNet: number; extrasCost: number } | null {
  const from = quotes.get(conv.from.id);
  const out = quotes.get(conv.output.id);
  if (!from || !out) return null;
  const rawNet = netPerUnit(from, s);
  const outNet = netPerUnit(out, s);
  if (rawNet === null || outNet === null) return null;
  let extrasCost = 0;
  for (const e of conv.extras) {
    const p = quotes.get(e.id);
    const price = p ? postPrice(p) : null;
    if (price === null) return null;
    extrasCost += price * e.qty;
  }
  const perBatch = outNet * conv.output.qty - extrasCost - rawNet * conv.from.qty;
  return { gainPerUnit: perBatch / conv.from.qty, rawNet, outNet, extrasCost };
}

export function adviseItem(
  itemId: number,
  quotes: Map<number, Quote>,
  conversions: Conversion[],
  skillFor: (profession: string) => number,
  s: Settings,
): Call {
  const q = quotes.get(itemId);
  const price = q ? postPrice(q) : null;
  if (!q || price === null) return { kind: "no-data", reason: "No price on your market yet." };

  // Best conversion the characters can already make.
  let best: { conv: Conversion; gain: number } | null = null;
  for (const conv of conversions) {
    if (conv.from.id !== itemId || skillFor(conv.profession) < conv.skill) continue;
    const r = conversionGain(conv, quotes, s);
    if (!r) continue;
    const out = quotes.get(conv.output.id);
    if (out?.saleRate !== null && out?.saleRate !== undefined && out.saleRate < s.slowSaleRate) continue;
    const threshold = Math.max(s.minGainCopper, r.rawNet * s.minGainShare);
    if (r.gainPerUnit >= threshold && (!best || r.gainPerUnit > best.gain)) best = { conv, gain: r.gainPerUnit };
  }
  if (best) {
    const caveat = best.conv.verified ? "" : " Recipe not yet checked in Forever.";
    return {
      kind: "convert",
      verb: best.conv.verb,
      outputId: best.conv.output.id,
      gainPerUnit: best.gain,
      reason: `${best.conv.verb} beats selling raw.${caveat}`,
    };
  }

  // Hold only when the cheapest listing is well under the recent market value
  // and a day of history shows the market is not simply sliding. Week-two
  // prices drift down from launch highs; holding into that loses money.
  const below = q.minBuyout !== null && q.marketValue !== null && q.minBuyout < q.marketValue * s.holdBelow;
  const share = below ? Math.round((1 - q.minBuyout! / q.marketValue!) * 100) : 0;
  const settled = (q.trendHours ?? 0) >= s.holdNeedsHours;
  if (below && settled && (q.trend ?? 0) > -s.fallingTrend) {
    return { kind: "hold", reason: `Listed ${share}% under its market value while the price holds steady. Wait for the cheap listings to clear.` };
  }

  const net = netPerUnit(q, s) ?? 0;
  const slow = q.saleRate !== null && q.saleRate < s.slowSaleRate;
  const notes: string[] = [];
  if (q.minBuyout === null) notes.push("Nothing listed: post at market value.");
  else notes.push("Match the cheapest listing.");
  if (q.saleRate === null) notes.push("No sales recorded EU-wide yet, so this price is unproven.");
  else if (slow) notes.push("Sells slowly: post small stacks.");
  if (below) {
    notes.push(
      settled
        ? `${share}% under market value, but the price is falling.`
        : `${share}% under market value. Too little history to tell a dip from a slide.`,
    );
  }
  const reason = notes.join(" ");
  return { kind: "sell", price, net, reason, slow };
}

// Conversions the characters cannot make yet that would pay: for deciding
// what to level.
export function lockedGains(
  itemId: number,
  quotes: Map<number, Quote>,
  conversions: Conversion[],
  skillFor: (profession: string) => number,
  s: Settings,
) {
  return conversions
    .filter((c) => c.from.id === itemId && skillFor(c.profession) < c.skill)
    .filter((c) => (quotes.get(c.output.id)?.saleRate ?? 1) >= s.slowSaleRate)
    .map((c) => ({ conv: c, r: conversionGain(c, quotes, s) }))
    .filter((x): x is { conv: Conversion; r: NonNullable<ReturnType<typeof conversionGain>> } => !!x.r && x.r.gainPerUnit > 0);
}
