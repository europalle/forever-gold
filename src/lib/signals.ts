// Market signals: read one item's price and supply like a trader reads a
// commodity. Pure and deterministic; the database work is in signal-run.ts.
//
// Each rule is borrowed from a real market (docs/signals.md has the cases):
// - FLOOD: inventories far above normal and still building. The 2014-16 oil
//   glut and the hog cycle: high prices pull producers in, supply overshoots,
//   prices fall until it clears. Don't sell into it; buyers wait.
// - CRASH: a fast fall. While supply still rises it is a falling knife; once
//   supply stops growing and the price holds, sellers are done (capitulation)
//   and a liquid item tends to snap back.
// - SQUEEZE: listings dry up and the price jumps. The 1973 oil embargo in
//   miniature: post into the shortage, because the high price brings the
//   farmers (producers) back within days.
// - SPIKE: far above its usual price without a shortage behind it: it reverts.
// - SLIDE: a steady fall day after day. Launch decay, like a console or an IPO
//   after the lockup: today's price is the best one you will see, so sell.
// - DIP: well under its usual price in a liquid market with no glut and no
//   slide: mean reversion, buy.
// - RICH: comfortably above its usual price and not falling: take the money.
// - UPTREND: rising with thinning supply: time-series momentum, let it run.

import { formatCopper } from "./money";

export type Point = { t: number; v: number }; // t in ms, ascending

export type SignalInput = {
  now: number;
  price: Point[]; // cheapest listed price per unit
  supply: Point[]; // units listed
  soldPerDay: number | null; // EU-wide, all rulesets: a liquidity gauge only
  saleRate: number | null;
};

export type Condition = "CRASH" | "FLOOD" | "SQUEEZE" | "SPIKE" | "SLIDE" | "DIP" | "RICH" | "UPTREND" | "CALM";
export type Action = "buy" | "sell" | "hold" | "wait" | "none";

export type Signal = {
  condition: Condition;
  action: Action;
  strength: 0 | 1 | 2; // 2 = strong
  reason: string;
  price: number;
  fair: number; // median price over the last week
  expected: number; // forecast for 24 hours ahead
  change24: number | null; // price change over 24 hours, as a fraction
  slope: number | null; // trend of the price per day, as a fraction
  z: number; // distance from fair in typical swings
  supplyRatio: number | null; // units listed against their weekly median
  supplyChange: number | null; // units listed against 24 hours ago, as a fraction
  liquid: boolean;
};

export const SIGNAL_RULES = {
  window: 7 * 86_400_000, // fair price and normal supply: the last week
  minSpan: 36 * 3_600_000, // history needed before any signal
  minPoints: 8,
  staleAfter: 8 * 3_600_000, // newest price older than this: no signal
  trendDays: 5,
  liquidSoldPerDay: 5,
  liquidSaleRate: 0.2,
};

const DAY = 86_400_000;
const HOUR = 3_600_000;

export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// The point nearest to time t, if one lies within tol.
export function at(series: Point[], t: number, tol = 6 * HOUR): Point | null {
  let best: Point | null = null;
  for (const p of series) {
    if (Math.abs(p.t - t) <= tol && (!best || Math.abs(p.t - t) < Math.abs(best.t - t))) best = p;
  }
  return best;
}

// Theil-Sen: the median of pairwise slopes, robust to a few odd listings.
// Also how many of the pairs agree with its sign (0.5 = noise, 1 = steady).
export function trend(series: Point[]): { slope: number; agree: number } | null {
  const pts = series.filter((p) => p.v > 0);
  if (pts.length < 6) return null;
  const step = Math.max(1, Math.floor(pts.length / 40));
  const s = pts.filter((_, i) => i % step === 0);
  const slopes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    for (let j = i + 1; j < s.length; j++) {
      const dt = (s[j].t - s[i].t) / DAY;
      if (dt >= 0.25) slopes.push((Math.log(s[j].v) - Math.log(s[i].v)) / dt);
    }
  }
  if (slopes.length < 5) return null;
  const m = median(slopes);
  const agree = slopes.filter((x) => Math.sign(x) === Math.sign(m)).length / slopes.length;
  return { slope: m, agree };
}

const pct = (x: number) => `${x > 0 ? "+" : ""}${Math.round(x * 100)}%`;
const off = (x: number) => `${Math.abs(Math.round(x * 100))}%`;
const times = (x: number) => `${x >= 10 ? Math.round(x) : Math.round(x * 10) / 10}x`;

export function computeSignal(input: SignalInput): Signal | null {
  const { now } = input;
  const R = SIGNAL_RULES;
  const price = input.price.filter((p) => p.v > 0 && p.t <= now && p.t >= now - R.window);
  if (price.length < R.minPoints) return null;
  if (price[price.length - 1].t - price[0].t < R.minSpan) return null;
  const last = price[price.length - 1];
  if (now - last.t > R.staleAfter) return null;
  const p = last.v;

  const fair = median(price.map((x) => x.v));
  const d = Math.log(p / fair);
  const swing = Math.max(0.05, 1.4826 * median(price.map((x) => Math.abs(Math.log(x.v / fair)))));
  const z = d / swing;

  const p24 = at(price, last.t - DAY);
  const change24 = p24 ? p / p24.v - 1 : null;
  const tr = trend(price.filter((x) => x.t >= last.t - R.trendDays * DAY));
  const slope = tr ? Math.exp(tr.slope) - 1 : null;
  const steady = tr ? tr.agree >= 0.7 : false;
  // The trend before the last day and a half: a slide was already falling
  // then; a sudden drop (a dip or a crash) was flat.
  const before = trend(price.filter((x) => x.t >= last.t - R.trendDays * DAY && x.t <= last.t - 1.5 * DAY));
  const slopeBefore = before ? Math.exp(before.slope) - 1 : null;

  const supply = input.supply.filter((x) => x.t <= now && x.t >= now - R.window);
  let supplyRatio: number | null = null;
  let supplyChange: number | null = null;
  if (supply.length >= 6 && supply[supply.length - 1].t - supply[0].t >= DAY && now - supply[supply.length - 1].t <= R.staleAfter) {
    const q = supply[supply.length - 1];
    const norm = median(supply.map((x) => x.v));
    if (norm > 0) supplyRatio = q.v / norm;
    const q24 = at(supply, q.t - DAY);
    if (q24 && q24.v > 0) supplyChange = q.v / q24.v - 1;
  }

  const liquid = (input.soldPerDay ?? 0) >= R.liquidSoldPerDay && (input.saleRate ?? 0) >= R.liquidSaleRate;
  const prev = price.length >= 2 ? price[price.length - 2].v : p;
  const holding = p >= prev * 0.98; // the newest price did not fall again

  // Forecast for 24 hours: half the trend carries on, a quarter of the gap to
  // fair closes (barely, in a steady trend, where the weekly median lags), and
  // a building glut pushes a little lower.
  let logNext = Math.log(p) + 0.5 * (tr ? tr.slope : 0) - (steady ? 0.05 : 0.25) * d;
  if (supplyRatio != null && supplyRatio >= 1.6 && (supplyChange ?? 0) > 0.15) logNext -= 0.03;
  const expected = Math.round(Math.exp(logNext));

  const base = { price: Math.round(p), fair: Math.round(fair), expected, change24, slope, z, supplyRatio, supplyChange, liquid };
  const sig = (condition: Condition, action: Action, strength: 0 | 1 | 2, reason: string): Signal => ({ condition, action, strength, reason, ...base });

  const supplyText = supplyRatio != null ? `${times(supplyRatio)} the usual supply` : "";

  // CRASH: fast fall.
  if ((change24 != null && change24 <= -0.2) || (z <= -2.5 && (change24 ?? 0) < -0.1)) {
    const fell = change24 != null ? `${pct(change24)} in a day` : `${off(Math.exp(d) - 1)} under its usual price`;
    const done = supplyChange != null && supplyChange <= -0.1 && (supplyRatio ?? 1) <= 1.3 && holding;
    if (done && liquid && d <= Math.log(0.75)) {
      return sig("CRASH", "buy", 2, `Crashed ${fell}, but supply is shrinking again and the price held: sellers look done. Buy for the rebound.`);
    }
    return sig("CRASH", "wait", 2, `Crashing: ${fell}${supplyChange != null && supplyChange > 0 ? `, supply still rising ${pct(supplyChange)}` : ""}. Don't catch a falling knife, and don't dump yours at the bottom.`);
  }

  // FLOOD: glut still building.
  if (supplyRatio != null && supplyRatio >= 1.6) {
    if ((supplyChange ?? 0) >= 0.15 && (change24 ?? 0) <= 0) {
      return sig("FLOOD", "hold", 2, `Flooded: ${supplyText} and still growing ${pct(supplyChange ?? 0)} a day. Don't post into it; buyers wait.`);
    }
    if ((supplyChange ?? 0) < 0 && d <= Math.log(0.8) && liquid) {
      return sig("FLOOD", "buy", 1, `A glut that is clearing: ${supplyText}, but shrinking ${pct(supplyChange ?? 0)} a day, ${off(Math.exp(d) - 1)} under its usual price.`);
    }
  }

  // SQUEEZE: shortage.
  if (supplyRatio != null && supplyRatio <= 0.5 && (supplyChange ?? 0) <= -0.15 && (change24 ?? 0) >= 0.1) {
    return sig("SQUEEZE", "sell", 2, `Short supply: ${supplyText}, price ${pct(change24 ?? 0)} in a day. Post now; the high price brings farmers back.`);
  }

  // SPIKE: far above usual without a shortage.
  if (z >= 2.5 && d >= Math.log(1.4)) {
    return sig("SPIKE", "sell", (change24 ?? 0) >= 0.2 ? 2 : 1, `Spiked ${off(Math.exp(d) - 1)} above its usual price. Spikes revert: sell now.`);
  }

  // SLIDE: steady decline.
  if (slope != null && steady && slope <= -0.04 && (slopeBefore == null || slopeBefore <= -0.02)) {
    return sig("SLIDE", "sell", slope <= -0.1 ? 2 : 1, `Sliding ${pct(slope)} a day, steadily. Today's price is likely the best you'll see: sell, don't stock up.`);
  }

  // DIP: cheap in a healthy market.
  if (d <= Math.log(0.75) && liquid && (slopeBefore == null || slopeBefore > -0.02) && (supplyRatio == null || supplyRatio < 1.3)) {
    return sig("DIP", "buy", d <= Math.log(0.6) ? 2 : 1, `${off(Math.exp(d) - 1)} under its usual price, sells well, no glut and no slide. Buy and relist near ${formatCopper(Math.round(fair))}.`);
  }

  // RICH: above usual and not falling.
  if (d >= Math.log(1.25) && (slope == null || slope >= -0.01)) {
    return sig("RICH", "sell", 1, `${off(Math.exp(d) - 1)} above its usual price. Good time to sell what you have.`);
  }

  // UPTREND: rising, supply thinning.
  if (slope != null && steady && slope >= 0.04 && (supplyRatio == null || supplyRatio <= 1)) {
    return sig("UPTREND", "hold", 1, `Rising ${pct(slope)} a day${supplyRatio != null ? ` with ${supplyText}` : ""}. Let it run before you post.`);
  }

  return sig("CALM", "none", 0, "Trading near its usual price.");
}

// ---- Backtest: replay the rules over stored history ----

export type Outcome = { condition: Condition; action: Action; strength: number; ret: number; hit: boolean };

// What counts as the signal being right, judged 72 hours later after the 5% cut:
// buy: selling then nets more than paying now. sell: selling now beat waiting.
// hold: the price did not fall more than 5%. wait: it was cheaper within the day.
export function judge(sig: Signal, later: number, dayLater: number | null, cut = 0.05): Outcome | null {
  if (sig.action === "none") return null;
  const p = sig.price;
  let ret = 0;
  let hit = false;
  if (sig.action === "buy") {
    ret = (later * (1 - cut)) / p - 1;
    hit = ret > 0;
  } else if (sig.action === "sell") {
    ret = p / later - 1;
    hit = later <= p;
  } else if (sig.action === "hold") {
    ret = later / p - 1;
    hit = ret >= -0.05;
  } else {
    const low = dayLater ?? later;
    ret = p / low - 1;
    hit = low < p;
  }
  return { condition: sig.condition, action: sig.action, strength: sig.strength, ret, hit };
}

export type BacktestRow = { key: string; condition: Condition; action: Action; strength: number; n: number; hitRate: number; avgReturn: number };
export type Backtest = {
  rows: BacktestRow[];
  forecast: { n: number; modelError: number; naiveError: number }; // mean absolute log error, 24h
  items: number;
  from: number | null;
  to: number | null;
};

export function backtest(items: Omit<SignalInput, "now">[], stepMs = 6 * HOUR, horizon = 3 * DAY): Backtest {
  const tally = new Map<string, { condition: Condition; action: Action; strength: number; n: number; hits: number; ret: number }>();
  let fn = 0, fModel = 0, fNaive = 0;
  let from: number | null = null, to: number | null = null;
  for (const item of items) {
    const ps = item.price;
    if (ps.length < SIGNAL_RULES.minPoints * 2) continue;
    const start = ps[0].t + SIGNAL_RULES.minSpan;
    const end = ps[ps.length - 1].t - DAY;
    let last: string | null = null;
    for (let t = start; t <= end; t += stepMs) {
      const sig = computeSignal({ ...item, now: t });
      if (!sig) continue;
      const day = at(ps, t + DAY, 3 * HOUR);
      if (day) {
        fn++;
        fModel += Math.abs(Math.log(day.v / sig.expected));
        fNaive += Math.abs(Math.log(day.v / sig.price));
      }
      // Count a signal once per run of the same call, at its first appearance.
      const key = `${sig.condition}:${sig.action}:${sig.strength}`;
      if (key === last) continue;
      last = key;
      if (t + horizon > ps[ps.length - 1].t) continue;
      const later = at(ps, t + horizon, 6 * HOUR);
      if (!later) continue;
      const lows = ps.filter((x) => x.t > t && x.t <= t + DAY).map((x) => x.v);
      const o = judge(sig, later.v, lows.length ? Math.min(...lows) : null);
      if (!o) continue;
      from = from == null ? t : Math.min(from, t);
      to = to == null ? t : Math.max(to, t);
      const e = tally.get(key) ?? { condition: o.condition, action: o.action, strength: o.strength, n: 0, hits: 0, ret: 0 };
      e.n++;
      e.hits += o.hit ? 1 : 0;
      e.ret += o.ret;
      tally.set(key, e);
    }
  }
  const rows = [...tally.entries()]
    .map(([key, e]) => ({ key, condition: e.condition, action: e.action, strength: e.strength, n: e.n, hitRate: e.hits / e.n, avgReturn: e.ret / e.n }))
    .sort((a, b) => b.n - a.n);
  return { rows, forecast: { n: fn, modelError: fn ? fModel / fn : 0, naiveError: fn ? fNaive / fn : 0 }, items: items.length, from, to };
}
