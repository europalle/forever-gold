import { MARKET } from "@/config/player";
import { SETTINGS } from "@/config/settings";
import { db } from "../db";
import { marketScope } from "../tsm";

// Discovery over the whole auction house: every item TSM prices on our market,
// with EU-wide demand. Item details (level, type) are not in TSM's files, so
// there is no level filter until item data comes from Blizzard's API.

export type MarketItem = {
  id: number;
  name: string;
  minBuyout: number | null;
  marketValue: number | null;
  historical: number | null;
  saleRate: number | null;
  soldPerDay: number | null;
  avgSalePrice: number | null; // EU-wide; only trusted when an item sells often
};

type Snapshots = { market: number | null; region: number | null; older: number | null; olderAt: Date | null };

const TREND_MIN_HOURS = 20;

async function snapshots(): Promise<Snapshots> {
  const scope = marketScope(MARKET);
  const [m, r] = await Promise.all([
    db.snapshot.findFirst({ where: { kind: "MARKET", scope }, orderBy: { sourceUpdatedAt: "desc" } }),
    db.snapshot.findFirst({ where: { kind: "REGION", scope: MARKET.region }, orderBy: { sourceUpdatedAt: "desc" } }),
  ]);
  // A snapshot about a day older, to tell a dip from a slide.
  const older = m
    ? await db.snapshot.findFirst({
        where: { kind: "MARKET", scope, sourceUpdatedAt: { lte: new Date(m.sourceUpdatedAt.getTime() - TREND_MIN_HOURS * 3_600_000) } },
        orderBy: { sourceUpdatedAt: "desc" },
      })
    : null;
  return { market: m?.id ?? null, region: r?.id ?? null, older: older?.id ?? null, olderAt: older?.sourceUpdatedAt ?? null };
}

type Raw = MarketItem & { olderValue: number | null };

async function rows(s: Snapshots, where: string, order: string, limit: number, params: unknown[] = []): Promise<Raw[]> {
  if (!s.market) return [];
  return db.$queryRawUnsafe<Raw[]>(
    `SELECT i.id, i.name, mp."minBuyout", mp."marketValue", mp.historical,
            rs."saleRate", rs."soldPerDay", rs."avgSalePrice", op."marketValue" AS "olderValue"
       FROM "MarketPrice" mp
       JOIN "Item" i ON i.id = mp."itemId"
       LEFT JOIN "RegionStat" rs ON rs."itemId" = mp."itemId" AND rs."snapshotId" = $2
       LEFT JOIN "MarketPrice" op ON op."itemId" = mp."itemId" AND op."snapshotId" = $3
      WHERE mp."snapshotId" = $1 AND i.name <> '' AND ${where}
      ORDER BY ${order}
      LIMIT ${Math.floor(limit)}`,
    s.market,
    s.region ?? -1,
    s.older ?? -1,
    ...params,
  );
}

export type Mover = MarketItem & { goldPerDay: number; trend: number | null };

// Where the gold moves: units sold per day (EU average per auction house) times
// TSM's market value. Average sale price is skipped: a single odd sale skews it.
export async function movers(limit = 40): Promise<{ items: Mover[]; trendSince: Date | null }> {
  const s = await snapshots();
  const r = await rows(
    s,
    `rs."soldPerDay" >= 1 AND mp."marketValue" IS NOT NULL`,
    `rs."soldPerDay" * mp."marketValue" DESC`,
    limit,
  );
  return {
    trendSince: s.olderAt,
    items: r.map((x) => ({
      ...x,
      goldPerDay: Math.round((x.soldPerDay ?? 0) * (x.marketValue ?? 0)),
      trend: x.olderValue && x.marketValue ? x.marketValue / x.olderValue - 1 : null,
    })),
  };
}

export type Deal = MarketItem & { target: number; profitEach: number; discount: number; trend: number | null };

// Listed well under the usual price, sells well, affordable. The usual price is
// the lowest of TSM's market value, its long average, and what it actually sold
// for EU-wide, so a launch-week high or a lagging average does not count as
// "usual". With a day of history, items still sliding are left out.
export async function deals(capEach: number, limit = 40): Promise<{ items: Deal[]; trendSince: Date | null }> {
  const s = await snapshots();
  const r = await rows(
    s,
    `mp."minBuyout" IS NOT NULL AND mp."marketValue" IS NOT NULL
       AND mp."minBuyout" <= $4
       AND mp."minBuyout" < 0.75 * LEAST(mp."marketValue", COALESCE(mp.historical, mp."marketValue"), COALESCE(rs."avgSalePrice", mp."marketValue"))
       AND rs."saleRate" >= 0.4 AND rs."soldPerDay" >= 5`,
    `(LEAST(mp."marketValue", COALESCE(mp.historical, mp."marketValue"), COALESCE(rs."avgSalePrice", mp."marketValue")) * ${1 - SETTINGS.cut} - mp."minBuyout") * rs."saleRate" DESC`,
    limit * 3,
    [capEach],
  );
  const items: Deal[] = [];
  for (const x of r) {
    const target = Math.min(x.marketValue!, x.historical ?? x.marketValue!, x.avgSalePrice ?? x.marketValue!);
    const trend = x.olderValue && x.marketValue ? x.marketValue / x.olderValue - 1 : null;
    if (trend !== null && trend < -0.1) continue; // sliding, not a dip
    const profitEach = Math.round(target * (1 - SETTINGS.cut) - x.minBuyout!);
    if (profitEach < SETTINGS.minGainCopper * 4) continue;
    items.push({ ...x, target, profitEach, discount: 1 - x.minBuyout! / target, trend });
    if (items.length >= limit) break;
  }
  return { items, trendSince: s.olderAt };
}

export async function search(q: string, limit = 40): Promise<MarketItem[]> {
  const s = await snapshots();
  const term = q.trim().slice(0, 60);
  if (term.length < 2) return [];
  return rows(s, `i.name ILIKE $4`, `rs."soldPerDay" DESC NULLS LAST, i.name`, limit, [`%${term.replace(/[\\%_]/g, (c) => "\\" + c)}%`]);
}

// How much one unit may cost: 10% of the user's gold from TSM, at least 20s,
// 1g when nothing is uploaded yet.
export async function capForUser(userId: string): Promise<{ cap: number; gold: number | null }> {
  const chars = await db.character.findMany({ where: { userId }, select: { money: true } });
  const known = chars.filter((c) => c.money !== null);
  if (!known.length) return { cap: 10_000, gold: null };
  const gold = known.reduce((a, c) => a + (c.money ?? 0), 0);
  return { cap: Math.max(2_000, Math.round(gold * 0.1)), gold };
}

export type ItemDetail = {
  id: number;
  name: string;
  history: { at: Date; minBuyout: number | null; marketValue: number | null }[];
  region: { saleRate: number | null; soldPerDay: number | null; avgSalePrice: number | null; marketValue: number | null } | null;
  mine: { kind: string; quantity: number; unitPrice: number; time: Date; character: string }[];
};

export async function itemDetail(id: number, userId: string): Promise<ItemDetail | null> {
  const item = await db.item.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!item) return null;
  const s = await snapshots();
  const [hist, region, mine] = await Promise.all([
    db.marketPrice.findMany({
      where: { itemId: id, snapshot: { kind: "MARKET", scope: marketScope(MARKET) } },
      select: { minBuyout: true, marketValue: true, snapshot: { select: { sourceUpdatedAt: true } } },
      orderBy: { snapshot: { sourceUpdatedAt: "asc" } },
    }),
    s.region
      ? db.regionStat.findUnique({ where: { snapshotId_itemId: { snapshotId: s.region, itemId: id } }, select: { saleRate: true, soldPerDay: true, avgSalePrice: true, marketValue: true } })
      : null,
    db.ledgerEntry.findMany({
      where: { userId, itemId: id, kind: { in: ["SALE", "BUY", "EXPIRED", "CANCELLED"] } },
      orderBy: { time: "desc" },
      take: 30,
      select: { kind: true, quantity: true, unitPrice: true, time: true, character: true },
    }),
  ]);
  return {
    id: item.id,
    name: item.name || `Item ${item.id}`,
    history: hist.map((h) => ({ at: h.snapshot.sourceUpdatedAt, minBuyout: h.minBuyout, marketValue: h.marketValue })),
    region,
    mine,
  };
}
