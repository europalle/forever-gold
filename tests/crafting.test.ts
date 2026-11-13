import { describe, expect, it } from "vitest";
import { craftRows, dedupeCrafts, type CraftRecipe } from "../src/lib/crafting";

const kit: CraftRecipe = { key: "b1", profession: "Leatherworking", name: "Thick Armor Kit", outputId: 8173, outputQty: 1, reagents: [[4304, 5], [4291, 1]], known: false, source: "blizzard" };
const prices = { ah: new Map([[8173, 1150], [4304, 500], [4291, 600]]), vendor: new Map([[4291, 500]]), soldHere: new Map([[8173, 40]]) };

describe("craftRows", () => {
  it("prices reagents at the cheaper of auction house and vendor, revenue after the cut", () => {
    const [r] = craftRows([kit], prices, 0.05);
    expect(r.cost).toBe(5 * 500 + 500);
    expect(r.revenue).toBe(Math.round(1150 * 0.95));
    expect(r.profit).toBe(r.revenue - r.cost);
    expect(r.profit).toBeLessThan(0); // kits lose money on this market
    expect(r.vendorParts).toBe(1);
    expect(r.perDay).toBe(Math.round(r.profit * 40 * 0.1));
  });
  it("leaves out recipes with an unpriced reagent or output", () => {
    expect(craftRows([{ ...kit, reagents: [[999, 1]] }], prices, 0.05)).toHaveLength(0);
    expect(craftRows([{ ...kit, outputId: 1 }], prices, 0.05)).toHaveLength(0);
  });
  it("keeps the learned recipe when two make the same thing", () => {
    const rows = craftRows([kit, { ...kit, key: "a1", known: true, source: "addon" }], prices, 0.05);
    const d = dedupeCrafts(rows);
    expect(d).toHaveLength(1);
    expect(d[0].known).toBe(true);
  });
});
