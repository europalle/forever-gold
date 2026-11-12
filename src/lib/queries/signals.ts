import { db } from "../db";
import { SCOREBOARD_KEY, type Scoreboard } from "../signal-run";
import { capForUser } from "./market";

export type SignalRow = {
  itemId: number;
  name: string;
  condition: string;
  action: string;
  strength: number;
  reason: string;
  price: number;
  fair: number;
  expected: number;
  change24: number | null;
  supplyRatio: number | null;
  soldPerDay: number | null;
  have: number; // across the user's characters
};

// What the user holds, summed over characters' bags, bank and mail.
export async function holdings(userId: string): Promise<Map<number, number>> {
  const chars = await db.character.findMany({ where: { userId }, select: { inventory: true } });
  const have = new Map<number, number>();
  for (const c of chars) {
    const inv = (c.inventory ?? {}) as Record<string, Record<string, number>>;
    for (const place of ["bags", "bank", "mail"]) {
      for (const [id, n] of Object.entries(inv[place] ?? {})) have.set(+id, (have.get(+id) ?? 0) + (Number(n) || 0));
    }
  }
  return have;
}

export async function signalBoard(userId: string) {
  const [rows, have, cap, board] = await Promise.all([
    db.itemSignal.findMany({ where: { action: { not: "none" } } }),
    holdings(userId),
    capForUser(userId),
    db.setting.findUnique({ where: { key: SCOREBOARD_KEY } }),
  ]);
  const names = new Map((await db.item.findMany({ where: { id: { in: rows.map((r) => r.itemId) } }, select: { id: true, name: true } })).map((i) => [i.id, i.name]));
  const all: SignalRow[] = rows.map((r) => ({
    itemId: r.itemId,
    name: names.get(r.itemId) || `Item ${r.itemId}`,
    condition: r.condition,
    action: r.action,
    strength: r.strength,
    reason: r.reason,
    price: r.price,
    fair: r.fair,
    expected: r.expected,
    change24: r.change24,
    supplyRatio: r.supplyRatio,
    soldPerDay: r.soldPerDay,
    have: have.get(r.itemId) ?? 0,
  }));
  const strongFirst = (a: SignalRow, b: SignalRow) => b.strength - a.strength || (b.soldPerDay ?? 0) - (a.soldPerDay ?? 0);
  const discount = (r: SignalRow) => r.price / Math.max(1, r.fair);
  return {
    at: rows[0]?.at ?? null,
    cap: cap.cap,
    mine: all.filter((r) => r.have > 0).sort(strongFirst),
    buys: all.filter((r) => r.action === "buy" && r.price <= cap.cap).sort((a, b) => b.strength - a.strength || discount(a) - discount(b)).slice(0, 40),
    sells: all.filter((r) => r.action === "sell" && r.strength === 2).sort(strongFirst).slice(0, 40),
    storms: all.filter((r) => r.condition === "CRASH" || r.condition === "FLOOD").sort(strongFirst).slice(0, 40),
    squeezes: all.filter((r) => r.condition === "SQUEEZE").sort(strongFirst).slice(0, 40),
    counts: countBy(all),
    scoreboard: (board?.value ?? null) as Scoreboard | null,
  };
}

function countBy(rows: SignalRow[]) {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.condition] = (out[r.condition] ?? 0) + 1;
  return out;
}

export async function itemSignal(itemId: number) {
  const [s, events] = await Promise.all([
    db.itemSignal.findUnique({ where: { itemId } }),
    db.signalEvent.findMany({ where: { itemId }, orderBy: { at: "desc" }, take: 8 }),
  ]);
  return { signal: s, events };
}
