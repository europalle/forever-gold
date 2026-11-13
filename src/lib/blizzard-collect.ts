import type { PrismaClient } from "@/generated/prisma/client";
import { MARKET } from "@/config/player";
import { decideBuyoutPerUnit, depthFrom, matchScore, soldBetween } from "./blizzard-depth";
import { Prisma } from "@/generated/prisma/client";
import { blizzardConfigured, commodities, houses, itemAuctions, rulesets } from "./blizzard";
import { marketScope, marketUrl, parseMarketCsv } from "./tsm";

export type HouseChoice = {
  rulesetId: number;
  houseId: number;
  houseName: string;
  buyoutPerUnit: boolean;
  chosenAt: string;
  scores?: { houseId: number; name: string; commodityRows: number; score: number; compared: number }[];
};

const SETTING = "blizzardHouse";
const KEEP_SNAPSHOTS = 72; // three days of hourly depth

export async function getHouseChoice(db: PrismaClient): Promise<HouseChoice | null> {
  const s = await db.setting.findUnique({ where: { key: SETTING } });
  return (s?.value as HouseChoice | undefined) ?? null;
}

async function tsmMinBuyouts(db: PrismaClient): Promise<Map<number, number>> {
  const latest = await db.snapshot.findFirst({ where: { kind: "MARKET", scope: marketScope(MARKET) }, orderBy: { sourceUpdatedAt: "desc" } });
  if (!latest) return new Map();
  const rows = await db.marketPrice.findMany({ where: { snapshotId: latest.id, minBuyout: { not: null } }, select: { itemId: true, minBuyout: true } });
  return new Map(rows.map((r) => [r.itemId, r.minBuyout!]));
}

// Our faction's prices on the Normal ruleset, straight from TSM's public file,
// to cross-check: our house should match PvP better than Normal. Not stored.
async function tsmOtherRuleset(ruleset: string): Promise<Map<number, number>> {
  try {
    const res = await fetch(marketUrl({ region: MARKET.region, ruleset, faction: MARKET.faction }), { cache: "no-store" });
    if (!res.ok) return new Map();
    return new Map(parseMarketCsv(await res.text()).filter((r) => r.minBuyout).map((r) => [r.itemId, r.minBuyout!]));
  } catch {
    return new Map();
  }
}

export type Discovery = {
  ruleset: { id: number; name?: string };
  candidates: { houseId: number; name: string; commodityRows: number; score: number; compared: number; normalScore?: number }[];
  chosen: HouseChoice | null;
  buyout: { perUnit: boolean; stacked: number; perUnitScore: number; perStackScore: number } | null;
  note: string;
};

// Find which house is ours by comparing each Alliance house's commodity prices
// with TSM's for EU PvP Alliance, then settle per-unit versus per-stack buyout
// on the winner's item auctions. Saves the choice when the winner is clear.
export async function discoverHouse(db: PrismaClient): Promise<Discovery> {
  if (!blizzardConfigured()) throw new Error("BNET_CLIENT_ID and BNET_CLIENT_SECRET are not set on this deployment.");
  const tsm = await tsmMinBuyouts(db);
  if (!tsm.size) throw new Error("No TSM prices collected yet to compare against.");
  const normal = await tsmOtherRuleset("normal");
  const rs = await rulesets();
  const ruleset = rs.find((r) => /^pvp$/i.test(r.name ?? "")) ?? rs.find((r) => r.id === 1) ?? rs[0];
  if (!ruleset) throw new Error("Blizzard listed no rulesets.");
  const all = await houses(ruleset.id);
  const wanted = new RegExp(MARKET.faction, "i");
  const list = all.filter((h) => wanted.test(h.name));
  const candidates: Discovery["candidates"] = [];
  for (const h of list.length ? list : all) {
    const c = await commodities(ruleset.id, h.id);
    const depth = depthFrom(c.auctions, false);
    const m = matchScore(depth, tsm);
    const n = normal.size ? matchScore(depth, normal).score : undefined;
    candidates.push({ houseId: h.id, name: h.name, commodityRows: c.auctions.length, ...m, normalScore: n });
  }
  candidates.sort((a, b) => b.score - a.score);
  const [best, second] = candidates;
  // Clear: enough shared items, well ahead of the runner-up, and (when the
  // Normal prices could be fetched) a better match for PvP than for Normal.
  const clear =
    best &&
    best.compared >= 50 &&
    best.score >= 0.3 &&
    (!second || best.score >= second.score * 1.5) &&
    (best.normalScore === undefined || best.score > best.normalScore);
  let buyout: Discovery["buyout"] = null;
  let chosen: HouseChoice | null = null;
  if (best && clear) {
    const items = await itemAuctions(ruleset.id, best.houseId);
    buyout = decideBuyoutPerUnit(items.auctions, tsm);
    chosen = { rulesetId: ruleset.id, houseId: best.houseId, houseName: best.name, buyoutPerUnit: buyout.stacked > 0 ? buyout.perUnit : false, chosenAt: new Date().toISOString(), scores: candidates };
    await db.setting.upsert({ where: { key: SETTING }, create: { key: SETTING, value: chosen }, update: { value: chosen } });
  }
  return {
    ruleset,
    candidates,
    chosen,
    buyout,
    note: clear
      ? `Chose ${best.name} (${best.houseId}): ${Math.round(best.score * 100)}% of ${best.compared} shared items match TSM's cheapest PvP price` +
        (best.normalScore !== undefined ? ` (against ${Math.round(best.normalScore * 100)}% for Normal).` : ".")
      : "No house matched TSM clearly enough to choose automatically. Pick one below if the scores make it obvious.",
  };
}

export async function chooseHouse(db: PrismaClient, rulesetId: number, houseId: number, houseName: string, buyoutPerUnit: boolean) {
  const value: HouseChoice = { rulesetId, houseId, houseName, buyoutPerUnit, chosenAt: new Date().toISOString() };
  await db.setting.upsert({ where: { key: SETTING }, create: { key: SETTING, value }, update: { value } });
}

// Hourly: store the chosen house's depth when Blizzard has published a new listing.
export async function collectBlizzard(db: PrismaClient) {
  if (!blizzardConfigured()) return { kind: "BLIZZARD" as const, scope: "eu", status: "unchanged" as const, detail: "not configured" };
  const choice = await getHouseChoice(db);
  if (!choice) return { kind: "BLIZZARD" as const, scope: "eu", status: "unchanged" as const, detail: "no house chosen yet (Admin page)" };
  const scope = `house-${choice.houseId}`;
  const last = await db.depthSnapshot.findFirst({ where: { houseId: choice.houseId }, orderBy: { lastModified: "desc" } });
  const c = await commodities(choice.rulesetId, choice.houseId, last?.lastModified);
  if (c.status === 304) return { kind: "BLIZZARD" as const, scope, status: "unchanged" as const, detail: "304" };
  if (c.status !== 200) return { kind: "BLIZZARD" as const, scope, status: "error" as const, detail: `commodities answered ${c.status}` };
  const items = await itemAuctions(choice.rulesetId, choice.houseId);
  if (items.status !== 200) return { kind: "BLIZZARD" as const, scope, status: "error" as const, detail: `item auctions answered ${items.status}` };
  const lastModified = c.lastModified ?? new Date();
  if (last && last.lastModified.getTime() === lastModified.getTime()) return { kind: "BLIZZARD" as const, scope, status: "unchanged" as const, detail: "same listing" };
  const depth = depthFrom([...c.auctions, ...items.auctions], choice.buyoutPerUnit);
  if (last) await storeFlow(db, last, lastModified, depth);
  await db.$transaction(
    async (tx) => {
      const snap = await tx.depthSnapshot.create({
        data: { houseId: choice.houseId, lastModified, itemCount: depth.size, auctionCount: c.auctions.length + items.auctions.length },
      });
      await tx.depthItem.createMany({ data: [...depth.values()].map((d) => ({ snapshotId: snap.id, ...d })) });
    },
    { timeout: 60_000 },
  );
  await storeSupply(db, lastModified, [...depth.values()]);
  const old = await db.depthSnapshot.findMany({ where: { houseId: choice.houseId }, orderBy: { lastModified: "desc" }, skip: KEEP_SNAPSHOTS, select: { id: true } });
  if (old.length) await db.depthSnapshot.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  return { kind: "BLIZZARD" as const, scope, status: "stored" as const, scanTime: lastModified.toISOString(), items: depth.size };
}

// The longer supply history: one point about every three hours, kept 30 days.
const SUPPLY_EVERY_MS = 2.5 * 3_600_000;
const SUPPLY_KEEP_DAYS = 30;

async function storeSupply(db: PrismaClient, at: Date, items: { itemId: number; minUnit: number; totalQty: number }[]) {
  const lastPoint = await db.supplyPoint.findFirst({ orderBy: { at: "desc" }, select: { at: true } });
  if (lastPoint && at.getTime() - lastPoint.at.getTime() < SUPPLY_EVERY_MS) return;
  await db.supplyPoint.createMany({
    data: items.map((d) => ({ itemId: d.itemId, at, minUnit: d.minUnit, totalQty: d.totalQty })),
    skipDuplicates: true,
  });
  await db.supplyPoint.deleteMany({ where: { at: { lt: new Date(at.getTime() - SUPPLY_KEEP_DAYS * 86_400_000) } } });
}

// Sales since the previous listing, added to the day's totals. Gaps over six
// hours are skipped: too much happens unseen to call the difference sales.
const FLOW_MAX_GAP_H = 6;
const FLOW_KEEP_DAYS = 30;

export async function storeFlow(db: PrismaClient, prev: { id: number; lastModified: Date }, at: Date, depth: Map<number, { ladder: [number, number][] }>) {
  const hours = (at.getTime() - prev.lastModified.getTime()) / 3_600_000;
  if (hours <= 0 || hours > FLOW_MAX_GAP_H) return;
  const before = await db.depthItem.findMany({ where: { snapshotId: prev.id }, select: { itemId: true, ladder: true } });
  const ids: number[] = [];
  const sold: number[] = [];
  for (const b of before) {
    const n = soldBetween(b.ladder as [number, number][], depth.get(b.itemId)?.ladder ?? null);
    if (n > 0) {
      ids.push(b.itemId);
      sold.push(Math.min(n, 2_000_000_000));
    }
  }
  const day = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  await db.$transaction([
    db.$executeRaw`
      INSERT INTO "ItemFlow" ("itemId", day, sold)
      SELECT * FROM unnest(${ids}::int[], ${ids.map(() => day)}::date[], ${sold}::int[])
      ON CONFLICT ("itemId", day) DO UPDATE SET sold = "ItemFlow".sold + EXCLUDED.sold`,
    db.$executeRaw`
      INSERT INTO "FlowDay" (day, hours) VALUES (${day}::date, ${hours})
      ON CONFLICT (day) DO UPDATE SET hours = "FlowDay".hours + EXCLUDED.hours`,
    db.$executeRaw(Prisma.sql`DELETE FROM "ItemFlow" WHERE day < ${new Date(at.getTime() - FLOW_KEEP_DAYS * 86_400_000)}::date`),
  ]);
}

// Units sold a day per item on our auction house over the last days, or an
// empty map until enough hours have been observed to mean something.
export const FLOW_MIN_HOURS = 12;
export async function realmSales(db: PrismaClient, days = 3, now = new Date()): Promise<{ perDay: Map<number, number>; hours: number }> {
  const since = new Date(now.getTime() - days * 86_400_000);
  const [h] = await db.$queryRaw<{ hours: number | null }[]>`SELECT SUM(hours)::float8 AS hours FROM "FlowDay" WHERE day >= ${since}::date`;
  const hours = h?.hours ?? 0;
  const perDay = new Map<number, number>();
  if (hours < FLOW_MIN_HOURS) return { perDay, hours };
  const rows = await db.$queryRaw<{ itemId: number; sold: number }[]>`
    SELECT "itemId", SUM(sold)::float8 AS sold FROM "ItemFlow" WHERE day >= ${since}::date GROUP BY "itemId"`;
  for (const r of rows) perDay.set(r.itemId, (r.sold / hours) * 24);
  return { perDay, hours };
}
