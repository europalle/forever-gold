import { describe, expect, it } from "vitest";
import { bracketOf, disenchantTable, vendorFlips, yieldTable, type LootRow } from "../src/lib/research";

const row = (p: Partial<LootRow>): LootRow => ({ npcId: null, npcName: null, npcLevel: null, sourceItemId: null, items: [], ...p });

describe("research summaries", () => {
  it("brackets levels like the research table", () => {
    expect([1, 10, 11, 15, 16, 31, 35, 60].map(bracketOf)).toEqual(["1-10", "1-10", "11-15", "11-15", "16-20", "31-35", "31-35", "56-60"]);
  });

  it("groups disenchants by quality, type and bracket", () => {
    const facts = new Map([
      [1, { quality: 2, classId: 4, reqLevel: 33, itemLevel: 38 }],
      [2, { quality: 2, classId: 2, reqLevel: 33, itemLevel: 38 }],
    ]);
    const t = disenchantTable(
      [
        row({ sourceItemId: 1, items: [[11137, 2]] }),
        row({ sourceItemId: 1, items: [[11137, 1]] }),
        row({ sourceItemId: 1, items: [[11135, 1]] }),
        row({ sourceItemId: 2, items: [[11135, 2]] }),
        row({ sourceItemId: 99, items: [[11137, 1]] }), // unknown source: left out
      ],
      facts,
    );
    expect(t).toHaveLength(2);
    const armor = t.find((g) => g.type === "armor")!;
    expect(armor).toMatchObject({ quality: 2, bracket: "31-35", n: 3 });
    expect(armor.drops[0]).toEqual({ itemId: 11137, share: 2 / 3, avgQty: 1.5 });
  });

  it("summarises yields per mob", () => {
    const y = yieldTable([
      row({ npcId: 2959, npcName: "Plainstrider", npcLevel: 12, items: [[2318, 2], [249427, 1]] }),
      row({ npcId: 2959, npcLevel: 14, items: [[2318, 1]] }),
      row({ npcId: 3, items: [[2318, 1]] }),
    ]);
    expect(y[0]).toMatchObject({ npcId: 2959, name: "Plainstrider", levels: [12, 14], n: 2 });
    expect(y[0].drops.find((d) => d.itemId === 249427)).toEqual({ itemId: 249427, share: 0.5, avgQty: 1 });
  });

  it("finds vendor items the auction house pays more for", () => {
    const flips = vendorFlips(
      [
        { itemId: 1, vendorName: "A", price: 100, stack: 5, stock: 3, extended: false },
        { itemId: 2, vendorName: "B", price: 1000, stack: 1, stock: null, extended: false },
        { itemId: 3, vendorName: "C", price: 1, stack: 1, stock: null, extended: true },
      ],
      new Map([[1, 200], [2, 900], [3, 5000]]),
      0.05,
    );
    expect(flips).toEqual([{ itemId: 1, vendor: "A", unitCost: 20, cheapest: 200, profit: 170, stock: 3 }]);
  });
});
