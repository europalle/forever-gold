import { describe, expect, it } from "vitest";
import type { Conversion } from "../src/config/items";
import { SETTINGS } from "../src/config/settings";
import { adviseItem, buyPrice, canMake, conversionGain, type Quote } from "../src/lib/advice";
import { applyRecipes, recipesFromCharacters } from "../src/lib/recipes";

const cure: Conversion = {
  verb: "Cure",
  from: { id: 4232, qty: 1 },
  extras: [{ id: 4289, qty: 1 }],
  output: { id: 4233, qty: 1 },
  profession: "Leatherworking",
  skill: 100,
  verified: false,
};

describe("applyRecipes", () => {
  it("takes reagents and quantities from the real recipe", () => {
    const [c] = applyRecipes([cure], [{ out: 4233, qty: 1, reag: [[4232, 1], [4289, 2], [2320, 1]], learned: true }]);
    expect(c.extras).toEqual([{ id: 4289, qty: 2 }, { id: 2320, qty: 1 }]);
    expect(c.verified).toBe(true);
    expect(c.known).toBe(true);
  });

  it("leaves a conversion alone when no recipe makes that item or uses that input", () => {
    expect(applyRecipes([cure], [{ out: 9999, qty: 1, reag: [[1, 1]], learned: true }])[0]).toBe(cure);
    expect(applyRecipes([cure], [{ out: 4233, qty: 1, reag: [[783, 1]], learned: true }])[0]).toBe(cure);
  });

  it("reads recipes from the addon's character data", () => {
    const r = recipesFromCharacters([{ recipes: { Leatherworking: { "3817": { out: 4233, qty: 1, reag: [[4232, 1], [4289, 1]], l: 0 } } } }]);
    expect(r).toEqual([{ out: 4233, qty: 1, reag: [[4232, 1], [4289, 1]], learned: false }]);
  });
});

describe("reagent prices and skill", () => {
  const q = (minBuyout: number | null, vendorBuy?: number): Quote => ({ minBuyout, marketValue: minBuyout, historical: minBuyout, saleRate: 0.9, soldPerDay: 100, vendorBuy });

  it("buys reagents from the vendor when that is cheaper", () => {
    expect(buyPrice(q(55, 40))).toBe(40);
    expect(buyPrice(q(55, 80))).toBe(55);
    expect(buyPrice(q(null, 40))).toBe(40);
  });

  it("uses the vendor price in the cure maths", () => {
    const quotes = new Map([[4232, q(239)], [4233, q(337)], [4289, q(55, 10)]]);
    const ah = conversionGain(cure, new Map([...quotes, [4289, q(55)]]), SETTINGS)!;
    const vendor = conversionGain(cure, quotes, SETTINGS)!;
    expect(vendor.gainPerUnit - ah.gainPerUnit).toBeCloseTo(45);
  });

  it("counts a learned recipe as makeable whatever the skill says", () => {
    expect(canMake({ ...cure, known: true }, () => 0)).toBe(true);
    expect(canMake(cure, () => 99)).toBe(false);
    const quotes = new Map([[4232, q(239)], [4233, q(337)], [4289, q(55)]]);
    expect(adviseItem(4232, quotes, [{ ...cure, known: true }], () => 0, SETTINGS).kind).toBe("convert");
  });
});
