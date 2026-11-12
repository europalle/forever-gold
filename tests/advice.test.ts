import { describe, expect, it } from "vitest";
import type { Conversion } from "../src/config/items";
import { SETTINGS } from "../src/config/settings";
import { adviseItem, conversionGain, lockedGains, netPerUnit, type Quote } from "../src/lib/advice";
import { formatCopper } from "../src/lib/money";

const q = (minBuyout: number | null, historical: number | null = minBuyout, saleRate: number | null = 0.9): Quote => ({
  minBuyout,
  marketValue: minBuyout,
  historical,
  saleRate,
  soldPerDay: 100,
});

const cure: Conversion = {
  verb: "Cure",
  from: { id: 1, qty: 1 },
  extras: [{ id: 3, qty: 1 }],
  output: { id: 2, qty: 1 },
  profession: "Leatherworking",
  skill: 100,
  verified: false,
};

const skill = (n: number) => () => n;

describe("formatCopper", () => {
  it("drops leading units and pads inner ones", () => {
    expect(formatCopper(55)).toBe("55c");
    expect(formatCopper(239)).toBe("2s 39c");
    expect(formatCopper(10_200)).toBe("1g 02s 00c");
    expect(formatCopper(152_378)).toBe("15g 23s 78c");
    expect(formatCopper(-120)).toBe("-1s 20c");
    expect(formatCopper(null)).toBe("-");
  });
});

describe("netPerUnit", () => {
  it("takes the cut and the expected deposit loss", () => {
    // 1000c * 0.95 = 950; deposit 100c * (1 - 0.9) / 20 = 0.5
    expect(netPerUnit(q(1000), SETTINGS)).toBeCloseTo(949.5);
  });
});

describe("adviseItem", () => {
  // Medium Hide on 2026-11-12: hide 2s 39c, cured 3s 37c, salt 55c.
  const quotes = new Map([
    [1, q(239, 498)],
    [2, q(337, 638)],
    [3, q(55)],
  ]);

  it("cures when the cured hide pays more than hide plus salt", () => {
    const r = conversionGain(cure, quotes, SETTINGS)!;
    expect(r.gainPerUnit).toBeGreaterThan(30);
    const call = adviseItem(1, quotes, [cure], skill(105), SETTINGS);
    expect(call.kind).toBe("convert");
  });

  it("does not offer a recipe the characters cannot make", () => {
    const call = adviseItem(1, quotes, [cure], skill(50), SETTINGS);
    expect(call.kind).toBe("sell");
    expect(lockedGains(1, quotes, [cure], skill(50), SETTINGS)).toHaveLength(1);
  });

  it("holds a dip only with a day of steady history", () => {
    const dip = { minBuyout: 600, marketValue: 1000, historical: 1000, saleRate: 0.9, soldPerDay: 100 };
    const at = (trend: number, trendHours: number) =>
      adviseItem(9, new Map([[9, { ...dip, trend, trendHours }]]), [], skill(0), SETTINGS);
    expect(at(0, 48).kind).toBe("hold");
    expect(at(-0.1, 48)).toMatchObject({ kind: "sell" }); // sliding, not a dip
    const young = at(0, 3);
    expect(young.kind).toBe("sell");
    expect(young.kind === "sell" && young.reason).toMatch(/Too little history/);
  });

  it("calls a price with no recorded sales unproven", () => {
    const m = new Map([[8, q(1000, 1000, null)]]);
    const call = adviseItem(8, m, [], skill(0), SETTINGS);
    expect(call.kind === "sell" && call.reason).toMatch(/unproven/);
  });

  it("leaves slow outputs out of the levelling list", () => {
    const slow = new Map(quotes);
    slow.set(2, q(337, 337, 0.1));
    expect(lockedGains(1, slow, [cure], skill(50), SETTINGS)).toHaveLength(0);
  });

  it("skips a conversion whose output barely sells", () => {
    const slow = new Map(quotes);
    slow.set(2, q(337, 337, 0.05));
    expect(adviseItem(1, slow, [cure], skill(105), SETTINGS).kind).not.toBe("convert");
  });

  it("sells at the cheapest listing when the price is normal", () => {
    const call = adviseItem(3, quotes, [], skill(0), SETTINGS);
    expect(call).toMatchObject({ kind: "sell", price: 55, slow: false });
  });

  it("flags slow sellers and items with nothing listed", () => {
    const m = new Map([
      [5, q(1000, 1000, 0.1)],
      [6, { minBuyout: null, marketValue: 800, historical: 800, saleRate: 0.8, soldPerDay: 5 }],
    ]);
    expect(adviseItem(5, m, [], skill(0), SETTINGS)).toMatchObject({ kind: "sell", slow: true });
    expect(adviseItem(6, m, [], skill(0), SETTINGS)).toMatchObject({ kind: "sell", price: 800 });
    expect(adviseItem(7, m, [], skill(0), SETTINGS).kind).toBe("no-data");
  });
});
