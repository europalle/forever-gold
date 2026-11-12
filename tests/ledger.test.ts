import { describe, expect, it } from "vitest";
import { byItem, totals, type Row } from "../src/lib/ledger";

const t = (h: number) => new Date(Date.UTC(2026, 10, 12, h));
const rows: Row[] = [
  { kind: "SALE", itemId: 2319, quantity: 57, unitPrice: 94, amount: 0, time: t(9) },
  { kind: "SALE", itemId: 2318, quantity: 10, unitPrice: 42, amount: 0, time: t(1) },
  { kind: "BUY", itemId: 6602, quantity: 1, unitPrice: 979, amount: 0, time: t(10) },
  { kind: "EXPENSE", itemId: null, quantity: 0, unitPrice: 0, amount: 510, time: t(11) },
  { kind: "EXPIRED", itemId: 4289, quantity: 20, unitPrice: 0, amount: 0, time: t(8) },
];

describe("ledger totals", () => {
  it("sums sales before and after the cut, buys and postage", () => {
    const x = totals(rows, 0.05);
    expect(x.sold).toBe(57 * 94 + 420);
    expect(x.soldAfterCut).toBe(Math.round((57 * 94 + 420) * 0.95));
    expect(x.bought).toBe(979);
    expect(x.expenses).toBe(510);
    expect(x.net).toBe(x.soldAfterCut - 979 - 510);
    expect(x.expired).toBe(1);
  });

  it("respects the window", () => {
    expect(totals(rows, 0.05, t(5)).sold).toBe(57 * 94);
  });

  it("groups by item, best sellers first", () => {
    const items = byItem(rows);
    expect(items[0]).toMatchObject({ itemId: 2319, soldQty: 57, soldGross: 5358 });
    expect(items.find((i) => i.itemId === 4289)).toMatchObject({ expired: 1, soldQty: 0 });
    expect(items.find((i) => i.itemId === 6602)).toMatchObject({ boughtQty: 1, boughtCost: 979 });
  });
});
