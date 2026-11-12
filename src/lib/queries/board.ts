import { CONVERSIONS, GROUP_ORDER, TRACKED, type Group, type TrackedItem } from "@/config/items";
import { MARKET } from "@/config/player";
import { SETTINGS } from "@/config/settings";
import { adviseItem, lockedGains, type Call, type Quote } from "../advice";
import { db } from "../db";
import { marketScope } from "../tsm";
import { skillsFor } from "./ledger";

export type Row = {
  item: TrackedItem;
  quote: Quote | null;
  trend: number | null; // market value change over the trend window, as a share
  call: Call;
  locked: { skill: number; verb: string; outputName: string; gainPerUnit: number }[];
};

export type Board = {
  marketScanAt: Date | null;
  regionScanAt: Date | null;
  snapshots: number;
  trendFrom: Date | null;
  groups: { group: Group; rows: Row[] }[];
  skills: Record<string, number>; // from the user's TSM uploads; empty until one
};

const TREND_DAYS = 7;

export async function board(userId: string): Promise<Board> {
  const scope = marketScope(MARKET);
  // The fixed list, plus whatever this user sold, bought or had expire in the
  // last 30 days according to their TSM uploads.
  const known = new Set(TRACKED.map((t) => t.id));
  const traded = await db.ledgerEntry.findMany({
    where: { userId, itemId: { not: null }, kind: { in: ["SALE", "BUY", "EXPIRED"] }, time: { gte: new Date(Date.now() - 30 * 86_400_000) } },
    distinct: ["itemId"],
    select: { itemId: true },
  });
  const extraIds = traded.map((t) => t.itemId!).filter((id) => !known.has(id));
  const extraNames = extraIds.length ? await db.item.findMany({ where: { id: { in: extraIds } }, select: { id: true, name: true } }) : [];
  const tracked: TrackedItem[] = [
    ...TRACKED,
    ...extraNames.map((n) => ({ id: n.id, name: n.name || `Item ${n.id}`, group: "From your trades" as const })),
  ];
  const ids = tracked.map((t) => t.id);
  const since = new Date(Date.now() - TREND_DAYS * 86_400_000);

  const skills = await skillsFor(userId);
  const bestSkill = (profession: string) => skills[profession] ?? 0;

  const [latest, oldest, region, snapshots] = await Promise.all([
    db.snapshot.findFirst({ where: { kind: "MARKET", scope }, orderBy: { sourceUpdatedAt: "desc" } }),
    db.snapshot.findFirst({
      where: { kind: "MARKET", scope, sourceUpdatedAt: { gte: since } },
      orderBy: { sourceUpdatedAt: "asc" },
    }),
    db.snapshot.findFirst({ where: { kind: "REGION", scope: MARKET.region }, orderBy: { sourceUpdatedAt: "desc" } }),
    db.snapshot.count({ where: { kind: "MARKET", scope } }),
  ]);

  const [now, then, stats] = await Promise.all([
    latest ? db.marketPrice.findMany({ where: { snapshotId: latest.id, itemId: { in: ids } } }) : [],
    oldest && oldest.id !== latest?.id
      ? db.marketPrice.findMany({ where: { snapshotId: oldest.id, itemId: { in: ids } } })
      : [],
    region ? db.regionStat.findMany({ where: { snapshotId: region.id, itemId: { in: ids } } }) : [],
  ]);

  const nowBy = new Map(now.map((p) => [p.itemId, p]));
  const thenBy = new Map(then.map((p) => [p.itemId, p]));
  const statBy = new Map(stats.map((s) => [s.itemId, s]));

  const trendHours =
    latest && oldest && oldest.id !== latest.id
      ? (latest.sourceUpdatedAt.getTime() - oldest.sourceUpdatedAt.getTime()) / 3_600_000
      : 0;
  const trendOf = (id: number) => {
    const a = thenBy.get(id)?.marketValue;
    const b = nowBy.get(id)?.marketValue;
    return a && b ? b / a - 1 : null;
  };

  const quotes = new Map<number, Quote>();
  for (const id of ids) {
    const p = nowBy.get(id);
    const s = statBy.get(id);
    if (!p && !s) continue;
    quotes.set(id, {
      minBuyout: p?.minBuyout ?? null,
      marketValue: p?.marketValue ?? null,
      historical: p?.historical ?? null,
      saleRate: s?.saleRate ?? null,
      soldPerDay: s?.soldPerDay ?? null,
      trend: trendOf(id),
      trendHours,
    });
  }

  const nameOf = (id: number) => tracked.find((t) => t.id === id)?.name ?? `Item ${id}`;

  const rows: Row[] = tracked.map((item) => {
    return {
      item,
      quote: quotes.get(item.id) ?? null,
      trend: trendOf(item.id),
      call: adviseItem(item.id, quotes, CONVERSIONS, bestSkill, SETTINGS),
      locked: lockedGains(item.id, quotes, CONVERSIONS, bestSkill, SETTINGS).map(({ conv, r }) => ({
        skill: conv.skill,
        verb: conv.verb,
        outputName: nameOf(conv.output.id),
        gainPerUnit: r.gainPerUnit,
      })),
    };
  });

  return {
    marketScanAt: latest?.sourceUpdatedAt ?? null,
    regionScanAt: region?.sourceUpdatedAt ?? null,
    snapshots,
    trendFrom: oldest && oldest.id !== latest?.id ? oldest.sourceUpdatedAt : null,
    groups: GROUP_ORDER.map((group) => ({ group, rows: rows.filter((r) => r.item.group === group) })),
    skills,
  };
}
