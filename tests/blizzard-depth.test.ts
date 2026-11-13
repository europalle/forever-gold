import { describe, expect, it } from "vitest";
import { decideBuyoutPerUnit, depthFrom, matchScore, unitPrice } from "../src/lib/blizzard-depth";
import { soldBetween } from "../src/lib/blizzard-depth";

describe("blizzard depth", () => {
  it("reads unit prices for commodities and item auctions", () => {
    expect(unitPrice({ unit_price: 210, quantity: 5 }, false)).toBe(210);
    expect(unitPrice({ buyout: 1000, quantity: 5 }, false)).toBe(200);
    expect(unitPrice({ buyout: 1000, quantity: 5 }, true)).toBe(1000);
    expect(unitPrice({ bid: 50, quantity: 1 }, false)).toBeNull();
  });

  it("builds depth and a ladder per item", () => {
    const d = depthFrom(
      [
        { item: { id: 4232 }, quantity: 20, unit_price: 239 },
        { item: { id: 4232 }, quantity: 5, unit_price: 239 },
        { item: { id: 4232 }, quantity: 10, unit_price: 245 },
        { item: { id: 4232 }, quantity: 40, unit_price: 300 },
        { item: { id: 1 }, quantity: 1, bid: 5 },
      ],
      false,
    );
    expect(d.get(4232)).toEqual({ itemId: 4232, minUnit: 239, qtyAtMin: 25, qtyNearMin: 35, totalQty: 75, auctions: 4, ladder: [[239, 25], [245, 10], [300, 40]] });
    expect(d.has(1)).toBe(false);
  });

  it("scores the house whose prices match TSM's", () => {
    const tsm = new Map([[1, 100], [2, 200], [3, 300]]);
    const ours = depthFrom([{ item: { id: 1 }, unit_price: 100 }, { item: { id: 2 }, unit_price: 202 }, { item: { id: 3 }, unit_price: 500 }], false);
    const other = depthFrom([{ item: { id: 1 }, unit_price: 150 }, { item: { id: 2 }, unit_price: 90 }], false);
    expect(matchScore(ours, tsm)).toEqual({ score: 2 / 3, compared: 3 });
    expect(matchScore(other, tsm).score).toBe(0);
  });

  it("decides whether buyout is per unit from stacked item auctions", () => {
    const tsm = new Map([[7, 50]]);
    expect(decideBuyoutPerUnit([{ item: { id: 7 }, quantity: 10, buyout: 500 }], tsm).perUnit).toBe(false);
    expect(decideBuyoutPerUnit([{ item: { id: 7 }, quantity: 10, buyout: 50 }], tsm).perUnit).toBe(true);
  });
});

describe("soldBetween", () => {
  it("counts what left the cheap end", () => {
    // 10 at 50c and 5 at 52c bought out, 3 of the 20 at 55c bought.
    expect(soldBetween([[50, 10], [52, 5], [55, 20], [60, 100]], [[55, 17], [60, 100]])).toBe(18);
  });
  it("counts nothing when someone undercuts or lists more", () => {
    expect(soldBetween([[50, 10], [55, 20]], [[48, 30], [50, 10], [55, 20]])).toBe(0);
    expect(soldBetween([[50, 10]], [[50, 25]])).toBe(0);
  });
  it("counts only the cheapest level when the item is gone", () => {
    expect(soldBetween([[50, 10], [55, 20]], null)).toBe(10);
    expect(soldBetween([], [[50, 1]])).toBe(0);
  });
});
