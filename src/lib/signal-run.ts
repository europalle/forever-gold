// Builds every item's signal from stored history and keeps the scoreboard:
// a replay of the rules over the last two weeks, and the live record of calls
// made since signals started. Runs after each collection (collector.ts).

import type { PrismaClient } from "@/generated/prisma/client";
import { MARKET } from "@/config/player";
import { TRACKED } from "@/config/items";
import { realmSales } from "./blizzard-collect";
import { at, backtest, computeSignal, judge, type Backtest, type Point, type Signal, type SignalInput } from "./signals";
import { marketScope } from "./tsm";

const HISTORY_DAYS = 14;
const MIN_SOLD_PER_DAY = 0.5; // items that hardly trade get no signal
const BACKTEST_EVERY_MS = 6 * 3_600_000;
const BACKTEST_ITEMS = 400;
const EVENT_KEEP_DAYS = 60;
export const SCOREBOARD_KEY = "signalScoreboard";

export type LiveRecord = { n: number; hits: number; avgReturn: number; byAction: Record<string, { n: number; hits: number }> };
export type Scoreboard = { at: string; backtest: Backtest; live: LiveRecord };

type Series = { price: Point[]; supply: Point[] };

export async function loadHistory(db: PrismaClient, ids: number[], since: Date): Promise<Map<number, Series>> {
  const scope = marketScope(MARKET);
  const [tsm, depth, supply] = await Promise.all([
    db.$queryRaw<{ itemId: number; t: Date; v: number }[]>`
      SELECT mp."itemId", s."sourceUpdatedAt" AS t, mp."minBuyout" AS v
      FROM "MarketPrice" mp JOIN "Snapshot" s ON s.id = mp."snapshotId"
      WHERE s.kind = 'MARKET' AND s.scope = ${scope} AND s."sourceUpdatedAt" >= ${since}
        AND mp."minBuyout" IS NOT NULL AND mp."itemId" = ANY(${ids})`,
    db.$queryRaw<{ itemId: number; t: Date; p: number; q: number }[]>`
      SELECT di."itemId", ds."lastModified" AS t, di."minUnit" AS p, di."totalQty" AS q
      FROM "DepthItem" di JOIN "DepthSnapshot" ds ON ds.id = di."snapshotId"
      WHERE ds."lastModified" >= ${since} AND di."itemId" = ANY(${ids})`,
    db.$queryRaw<{ itemId: number; t: Date; p: number; q: number }[]>`
      SELECT "itemId", at AS t, "minUnit" AS p, "totalQty" AS q FROM "SupplyPoint"
      WHERE at >= ${since} AND "itemId" = ANY(${ids})`,
  ]);
  const out = new Map<number, Series>();
  const get = (id: number) => {
    let s = out.get(id);
    if (!s) out.set(id, (s = { price: [], supply: [] }));
    return s;
  };
  for (const r of tsm) get(r.itemId).price.push({ t: r.t.getTime(), v: r.v });
  for (const r of [...depth, ...supply]) {
    const s = get(r.itemId);
    s.price.push({ t: r.t.getTime(), v: r.p });
    s.supply.push({ t: r.t.getTime(), v: r.q });
  }
  for (const s of out.values()) {
    s.price = dedupe(s.price);
    s.supply = dedupe(s.supply);
  }
  return out;
}

// Sorted, one point per time (Blizzard's hourly rows and the 3-hour copies overlap).
function dedupe(points: Point[]): Point[] {
  points.sort((a, b) => a.t - b.t);
  return points.filter((p, i) => i === 0 || p.t !== points[i - 1].t);
}

export async function runSignals(db: PrismaClient, now = new Date()) {
  const region = await db.snapshot.findFirst({ where: { kind: "REGION", scope: MARKET.region }, orderBy: { sourceUpdatedAt: "desc" } });
  const stats = region
    ? await db.regionStat.findMany({ where: { snapshotId: region.id }, select: { itemId: true, soldPerDay: true, saleRate: true } })
    : [];
  const statOf = new Map(stats.map((s) => [s.itemId, s]));
  // Sales measured on this auction house replace the EU-wide figure once there are enough hours of them.
  const here = await realmSales(db, 3, now);
  const ids = [...new Set([...here.perDay.keys(), ...stats.filter((s) => (s.soldPerDay ?? 0) >= MIN_SOLD_PER_DAY).map((s) => s.itemId), ...TRACKED.map((t) => t.id)])];
  const since = new Date(now.getTime() - HISTORY_DAYS * 86_400_000);
  const history = await loadHistory(db, ids, since);

  const inputs = new Map<number, SignalInput>();
  const signals: { itemId: number; s: Signal }[] = [];
  for (const id of ids) {
    const h = history.get(id);
    if (!h) continue;
    const st = statOf.get(id);
    const measured = here.hours > 0 && here.perDay.size > 0;
    const input: SignalInput = {
      now: now.getTime(),
      price: h.price,
      supply: h.supply,
      soldPerDay: measured ? (here.perDay.get(id) ?? 0) : (st?.soldPerDay ?? null),
      saleRate: st?.saleRate ?? null,
      measuredHere: measured,
    };
    inputs.set(id, input);
    const s = computeSignal(input);
    if (s) signals.push({ itemId: id, s });
  }

  const previous = new Map((await db.itemSignal.findMany({ select: { itemId: true, condition: true, action: true, strength: true } })).map((p) => [p.itemId, p]));
  const events = signals.filter(({ itemId, s }) => {
    if (s.action === "none") return false;
    const p = previous.get(itemId);
    return !p || p.condition !== s.condition || p.action !== s.action || p.strength !== s.strength;
  });

  await db.$transaction(
    async (tx) => {
      await tx.itemSignal.deleteMany({});
      await tx.itemSignal.createMany({
        data: signals.map(({ itemId, s }) => ({
          itemId,
          at: now,
          condition: s.condition,
          action: s.action,
          strength: s.strength,
          reason: s.reason,
          price: s.price,
          fair: s.fair,
          expected: s.expected,
          change24: finite(s.change24),
          slope: finite(s.slope),
          z: finite(s.z) ?? 0,
          supplyRatio: finite(s.supplyRatio),
          supplyChange: finite(s.supplyChange),
          liquid: s.liquid,
          soldPerDay: statOf.get(itemId)?.soldPerDay ?? null,
          soldHere: here.perDay.get(itemId) ?? (here.perDay.size ? 0 : null),
          daysCover: cover(history.get(itemId)?.supply, here.perDay.get(itemId)),
        })),
      });
      if (events.length) {
        await tx.signalEvent.createMany({
          data: events.map(({ itemId, s }) => ({ itemId, at: now, condition: s.condition, action: s.action, strength: s.strength, price: s.price, fair: s.fair })),
        });
      }
      await tx.signalEvent.deleteMany({ where: { at: { lt: new Date(now.getTime() - EVENT_KEEP_DAYS * 86_400_000) } } });
    },
    { timeout: 60_000 },
  );

  // The scoreboard: replayed every six hours over the most traded items.
  const stored = await db.setting.findUnique({ where: { key: SCOREBOARD_KEY } });
  const last = stored ? new Date((stored.value as unknown as Scoreboard).at).getTime() : 0;
  let refreshed = false;
  if (now.getTime() - last >= BACKTEST_EVERY_MS) {
    const top = [...inputs.entries()]
      .sort((a, b) => (b[1].soldPerDay ?? 0) - (a[1].soldPerDay ?? 0))
      .slice(0, BACKTEST_ITEMS)
      .map(([, i]) => ({ price: i.price, supply: i.supply, soldPerDay: i.soldPerDay, saleRate: i.saleRate, measuredHere: i.measuredHere }));
    const live = await liveRecord(db, history, now);
    const value: Scoreboard = { at: now.toISOString(), backtest: backtest(top), live };
    await db.setting.upsert({
      where: { key: SCOREBOARD_KEY },
      create: { key: SCOREBOARD_KEY, value: value as never },
      update: { value: value as never },
    });
    refreshed = true;
  }
  return { items: signals.length, calls: signals.filter((x) => x.s.action !== "none").length, events: events.length, backtest: refreshed };
}

// Calls made at least 72 hours ago, judged by what the price did next.
async function liveRecord(db: PrismaClient, history: Map<number, Series>, now: Date): Promise<LiveRecord> {
  const horizon = 3 * 86_400_000;
  const events = await db.signalEvent.findMany({ where: { at: { lte: new Date(now.getTime() - horizon) } } });
  const rec: LiveRecord = { n: 0, hits: 0, avgReturn: 0, byAction: {} };
  let sum = 0;
  for (const e of events) {
    const h = history.get(e.itemId);
    if (!h) continue;
    const later = at(h.price, e.at.getTime() + horizon, 6 * 3_600_000);
    if (!later) continue;
    const lows = h.price.filter((x) => x.t > e.at.getTime() && x.t <= e.at.getTime() + 86_400_000).map((x) => x.v);
    const o = judge({ action: e.action, condition: e.condition, strength: e.strength, price: e.price } as Signal, later.v, lows.length ? Math.min(...lows) : null);
    if (!o) continue;
    rec.n++;
    rec.hits += o.hit ? 1 : 0;
    sum += o.ret;
    const b = (rec.byAction[e.action] ??= { n: 0, hits: 0 });
    b.n++;
    b.hits += o.hit ? 1 : 0;
  }
  rec.avgReturn = rec.n ? sum / rec.n : 0;
  return rec;
}

const finite = (x: number | null) => (x != null && Number.isFinite(x) ? x : null);

// Days the listed stock would last at the measured sales rate.
function cover(supply: Point[] | undefined, perDay: number | undefined): number | null {
  const q = supply?.[supply.length - 1]?.v;
  if (!q || !perDay) return null;
  return Math.min(9999, q / perDay);
}
