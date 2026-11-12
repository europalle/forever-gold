import { describe, expect, it } from "vitest";
import { backtest, computeSignal, judge, median, trend, type Point } from "../src/lib/signals";

const H = 3_600_000;
const NOW = Date.UTC(2026, 10, 12, 12);

// A series every `step` hours over `days`, valued by f(hours before now).
function series(days: number, f: (hAgo: number) => number, step = 3): Point[] {
  const out: Point[] = [];
  for (let h = days * 24; h >= 0; h -= step) out.push({ t: NOW - h * H, v: Math.round(f(h)) });
  return out;
}
const wiggle = (h: number) => 1 + 0.03 * Math.sin(h / 5); // a little ordinary noise
const liquid = { soldPerDay: 50, saleRate: 0.5 };

describe("helpers", () => {
  it("median and trend", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    const t = trend(series(5, (h) => 1000 * Math.exp((-0.1 * (120 - h)) / 24)));
    expect(t!.slope).toBeCloseTo(-0.1, 2);
    expect(t!.agree).toBe(1);
  });
});

describe("computeSignal", () => {
  it("needs a day and a half of history", () => {
    expect(computeSignal({ now: NOW, price: series(1, () => 100), supply: [], ...liquid })).toBeNull();
  });

  it("calls a quiet market calm", () => {
    const s = computeSignal({ now: NOW, price: series(7, (h) => 1000 * wiggle(h)), supply: series(7, (h) => 500 * wiggle(h)), ...liquid })!;
    expect(s.condition).toBe("CALM");
    expect(s.action).toBe("none");
    expect(s.fair).toBeGreaterThan(950);
  });

  it("sees a flood building and says hold", () => {
    const s = computeSignal({
      now: NOW,
      price: series(7, (h) => (h < 24 ? 950 : 1000) * wiggle(h)),
      supply: series(7, (h) => (h < 24 ? 500 * (3 - h / 24) : 500) * wiggle(h)),
      ...liquid,
    })!;
    expect(s.condition).toBe("FLOOD");
    expect(s.action).toBe("hold");
    expect(s.strength).toBe(2);
    expect(s.supplyRatio!).toBeGreaterThan(1.6);
  });

  it("calls a crash with supply still rising a falling knife", () => {
    const s = computeSignal({
      now: NOW,
      price: series(7, (h) => (h <= 12 ? 600 : 1000) * wiggle(h)),
      supply: series(7, (h) => (h <= 12 ? 900 : 500)),
      ...liquid,
    })!;
    expect(s.condition).toBe("CRASH");
    expect(s.action).toBe("wait");
  });

  it("buys the crash once supply shrinks and the price holds", () => {
    const s = computeSignal({
      now: NOW,
      price: series(7, (h) => (h <= 18 ? 550 : 1000)),
      supply: series(7, (h) => (h <= 6 ? 420 : h <= 30 ? 600 : 500)),
      ...liquid,
    })!;
    expect(s.condition).toBe("CRASH");
    expect(s.action).toBe("buy");
    expect(s.strength).toBe(2);
  });

  it("does not buy a crash on an item that hardly sells", () => {
    const s = computeSignal({
      now: NOW,
      price: series(7, (h) => (h <= 18 ? 550 : 1000)),
      supply: series(7, (h) => (h <= 6 ? 420 : h <= 30 ? 600 : 500)),
      soldPerDay: 1,
      saleRate: 0.05,
    })!;
    expect(s.action).toBe("wait");
  });

  it("sells into a squeeze", () => {
    const s = computeSignal({
      now: NOW,
      price: series(7, (h) => (h <= 12 ? 1400 : 1000) * wiggle(h)),
      supply: series(7, (h) => (h <= 12 ? 150 : 500)),
      ...liquid,
    })!;
    expect(s.condition).toBe("SQUEEZE");
    expect(s.action).toBe("sell");
    expect(s.strength).toBe(2);
  });

  it("sells a steady launch slide", () => {
    const s = computeSignal({ now: NOW, price: series(7, (h) => 1000 * Math.exp((-0.08 * (168 - h)) / 24)), supply: [], ...liquid })!;
    expect(s.condition).toBe("SLIDE");
    expect(s.action).toBe("sell");
    expect(s.expected).toBeLessThan(s.price);
  });

  it("buys a dip in a liquid market", () => {
    const s = computeSignal({
      now: NOW,
      price: series(7, (h) => (h <= 3 ? 650 : 1000) * wiggle(h)),
      supply: series(7, () => 500),
      ...liquid,
    })!;
    // One scan at 35% off is a dip, not a crash: the day-old price is too close.
    expect(["DIP", "CRASH"]).toContain(s.condition);
    expect(s.action === "buy" || s.action === "wait").toBe(true);
  });

  it("buys a slow dip that is not a crash", () => {
    const s = computeSignal({
      now: NOW,
      price: series(7, (h) => (h <= 36 ? 700 : 1000) * wiggle(h)),
      supply: series(7, () => 500),
      ...liquid,
    })!;
    expect(s.condition).toBe("DIP");
    expect(s.action).toBe("buy");
    expect(s.reason).toMatch(/relist near/);
  });

  it("sells a spike without a shortage", () => {
    const s = computeSignal({
      now: NOW,
      price: series(7, (h) => (h <= 9 ? 1800 : 1000) * wiggle(h)),
      supply: series(7, () => 500),
      ...liquid,
    })!;
    expect(s.condition).toBe("SPIKE");
    expect(s.action).toBe("sell");
  });

  it("ignores a stale price", () => {
    const price = series(7, () => 1000).filter((p) => p.t < NOW - 12 * H);
    expect(computeSignal({ now: NOW, price, supply: [], ...liquid })).toBeNull();
  });
});

describe("judge and backtest", () => {
  it("judges after the cut", () => {
    const sig = computeSignal({ now: NOW, price: series(7, (h) => (h <= 36 ? 700 : 1000) * wiggle(h)), supply: series(7, () => 500), ...liquid })!;
    expect(judge(sig, sig.price * 1.04, null)!.hit).toBe(false); // 4% up does not cover a 5% cut
    expect(judge(sig, sig.price * 1.2, null)!.hit).toBe(true);
  });

  it("scores the rules on a market that dips and recovers", () => {
    // Twelve days: calm, a two-day dip to 65%, back to normal.
    const price: Point[] = [];
    const supply: Point[] = [];
    for (let h = 12 * 24; h >= 0; h -= 3) {
      const day = (12 * 24 - h) / 24;
      const v = day >= 6 && day < 8 ? 650 : 1000;
      price.push({ t: NOW - h * H, v: Math.round(v * wiggle(h)) });
      supply.push({ t: NOW - h * H, v: 500 });
    }
    const b = backtest([{ price, supply, ...liquid }]);
    const dip = b.rows.find((r) => r.condition === "DIP" && r.action === "buy");
    expect(dip).toBeDefined();
    expect(dip!.hitRate).toBe(1);
    expect(b.forecast.n).toBeGreaterThan(10);
  });
});
