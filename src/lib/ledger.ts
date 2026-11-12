// Sums over a user's TSM ledger. Pure: rows in, figures out. TSM records the
// sale price before the auction house cut.

export type Row = {
  kind: "SALE" | "BUY" | "EXPIRED" | "CANCELLED" | "INCOME" | "EXPENSE";
  itemId: number | null;
  quantity: number;
  unitPrice: number;
  amount: number;
  time: Date;
};

export type Totals = {
  sold: number; // copper, before the cut
  soldAfterCut: number;
  bought: number;
  expenses: number; // postage and other costs TSM logs
  income: number; // other money in, e.g. mail from other players
  net: number; // after cut + income - bought - expenses
  sales: number; // rows
  expired: number; // rows
  cancelled: number;
};

export type ItemStats = {
  itemId: number;
  soldQty: number;
  soldGross: number;
  boughtQty: number;
  boughtCost: number;
  expired: number;
  lastSale: Date | null;
};

export function totals(rows: Row[], cut: number, since?: Date): Totals {
  const t: Totals = { sold: 0, soldAfterCut: 0, bought: 0, expenses: 0, income: 0, net: 0, sales: 0, expired: 0, cancelled: 0 };
  for (const r of rows) {
    if (since && r.time < since) continue;
    if (r.kind === "SALE") {
      t.sold += r.unitPrice * r.quantity;
      t.sales++;
    } else if (r.kind === "BUY") t.bought += r.unitPrice * r.quantity;
    else if (r.kind === "EXPENSE") t.expenses += r.amount;
    else if (r.kind === "INCOME") t.income += r.amount;
    else if (r.kind === "EXPIRED") t.expired++;
    else if (r.kind === "CANCELLED") t.cancelled++;
  }
  t.soldAfterCut = Math.round(t.sold * (1 - cut));
  t.net = t.soldAfterCut + t.income - t.bought - t.expenses;
  return t;
}

export function byItem(rows: Row[]): ItemStats[] {
  const m = new Map<number, ItemStats>();
  for (const r of rows) {
    if (r.itemId === null) continue;
    let s = m.get(r.itemId);
    if (!s) {
      s = { itemId: r.itemId, soldQty: 0, soldGross: 0, boughtQty: 0, boughtCost: 0, expired: 0, lastSale: null };
      m.set(r.itemId, s);
    }
    if (r.kind === "SALE") {
      s.soldQty += r.quantity;
      s.soldGross += r.unitPrice * r.quantity;
      if (!s.lastSale || r.time > s.lastSale) s.lastSale = r.time;
    } else if (r.kind === "BUY") {
      s.boughtQty += r.quantity;
      s.boughtCost += r.unitPrice * r.quantity;
    } else if (r.kind === "EXPIRED") s.expired++;
  }
  return [...m.values()].sort((a, b) => b.soldGross - a.soldGross || b.boughtCost - a.boughtCost || b.expired - a.expired);
}
