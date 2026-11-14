// The addon's data file, ForeverGold_Data.lua: prices for every item on the
// market (so any tooltip works), this user's calls and lists, and the item IDs
// whose details the site still lacks (the addon looks them up in game).

import { MARKET } from "@/config/player";
import { SETTINGS } from "@/config/settings";
import { db } from "./db";
import { luaAssign, type LuaOut } from "./lua-write";
import { board } from "./queries/board";
import { capForUser, deals } from "./queries/market";
import { holdings } from "./queries/signals";
import { craftView } from "./queries/crafting";
import { disenchantValues } from "./queries/research";
import { marketScope } from "./tsm";

export const ADDON_DATA_VERSION = 1; // fields are only ever added: older addons ignore what they do not know
const ALERT_LIMIT = 30;
const WANT_LIMIT = 3000; // item lookups asked for per file, so a session is not flooded

const callCode = { sell: "S", hold: "H", convert: "C", "no-data": "N" } as const;

export async function buildAddonData(userId: string, displayName: string, now = new Date()) {
  const scope = marketScope(MARKET);
  const [latest, region] = await Promise.all([
    db.snapshot.findFirst({ where: { kind: "MARKET", scope }, orderBy: { sourceUpdatedAt: "desc" } }),
    db.snapshot.findFirst({ where: { kind: "REGION", scope: MARKET.region }, orderBy: { sourceUpdatedAt: "desc" } }),
  ]);
  const [prices, stats, b, cap, signals, have] = await Promise.all([
    latest ? db.marketPrice.findMany({ where: { snapshotId: latest.id }, select: { itemId: true, minBuyout: true, marketValue: true } }) : [],
    region ? db.regionStat.findMany({ where: { snapshotId: region.id }, select: { itemId: true, saleRate: true, soldPerDay: true } }) : [],
    board(userId),
    capForUser(userId),
    db.itemSignal.findMany({ where: { action: { not: "none" } } }),
    holdings(userId),
  ]);
  const buy = await deals(cap.cap, 15);

  // p[id] = { m = cheapest, v = market value, r = sale rate %, d = sold a day }
  const statOf = new Map(stats.map((s) => [s.itemId, s]));
  const p: Record<string, LuaOut> = {};
  for (const x of prices) {
    const s = statOf.get(x.itemId);
    p[x.itemId] = {
      m: x.minBuyout ?? undefined,
      v: x.marketValue ?? undefined,
      r: s?.saleRate != null ? Math.round(s.saleRate * 100) : undefined,
      d: s?.soldPerDay != null ? Math.round(s.soldPerDay) : undefined,
    };
  }

  // calls[id] = { k = S|H|C|N, g = net or gain each, t = short reason, o = output item for C }
  const calls: Record<string, LuaOut> = {};
  const lists = { sell: [] as LuaOut[], make: [] as LuaOut[], hold: [] as LuaOut[], buy: [] as LuaOut[] };
  for (const g of b.groups) {
    for (const row of g.rows) {
      const c = row.call;
      const entry: Record<string, LuaOut> = { k: callCode[c.kind], t: c.reason };
      if (c.kind === "sell") {
        entry.g = Math.round(c.net);
        entry.pr = c.price;
        lists.sell.push(row.item.id);
      } else if (c.kind === "convert") {
        entry.g = Math.round(c.gainPerUnit);
        entry.o = c.outputId;
        entry.vb = c.verb;
        lists.make.push({ id: row.item.id, o: c.outputId, g: Math.round(c.gainPerUnit), vb: c.verb });
      } else if (c.kind === "hold") {
        lists.hold.push(row.item.id);
      }
      calls[row.item.id] = entry;
    }
  }
  for (const d of buy.items) {
    lists.buy.push({ id: d.id, pr: d.minBuyout, u: d.target, g: d.profitEach });
    calls[d.id] ??= { k: "B", g: d.profitEach, t: `Listed ${Math.round(d.discount * 100)}% under its usual price and sells well.` };
  }

  // sig[id] = { a = B|S|H|W, s = strength, c = condition, f = usual price,
  // e = expected in 24h, t = reason }. alerts = the strongest calls on what the
  // user holds, then strong buys they can afford.
  const sig: Record<string, LuaOut> = {};
  const actionCode: Record<string, string> = { buy: "B", sell: "S", hold: "H", wait: "W" };
  for (const s of signals) {
    sig[s.itemId] = { a: actionCode[s.action], s: s.strength, c: s.condition, f: s.fair, e: s.expected, t: s.reason };
  }
  const rank = (s: (typeof signals)[number]) => s.strength * 10 + (s.action === "sell" || s.action === "wait" ? 1 : 0);
  const alerts = [
    ...signals.filter((s) => (have.get(s.itemId) ?? 0) > 0 && s.strength >= 1).sort((a, b) => rank(b) - rank(a)),
    ...signals.filter((s) => s.action === "buy" && s.strength === 2 && s.price <= cap.cap && !have.get(s.itemId)),
  ]
    .slice(0, ALERT_LIMIT)
    .map((s) => s.itemId);

  // craft = learned recipes that pay: { o = output, n = name, g = profit each,
  // c = cost, q = output quantity, be = revenue over cost (how far reagent
  // prices can rise before it stops paying), r = { { id, qty }, ... } }.
  // vend[id] = vendor price for reagents a vendor sells cheaper.
  const cv = await craftView(userId, null, true, 30);
  const craft: LuaOut[] = [];
  const vend: Record<string, LuaOut> = {};
  for (const r of cv.rows) {
    if (r.profit <= 0) continue;
    craft.push({ o: r.outputId, n: r.name, g: r.profit, c: r.cost, q: r.outputQty, be: Math.round((r.revenue / r.cost) * 100) / 100, pf: r.profession, r: r.reagents.map(([id, qty]) => [id, qty]) });
    for (const [id] of r.reagents) {
      const v = cv.vendor.get(id);
      if (v != null) vend[id] = Math.round(v);
    }
  }
  // de["quality|armor or weapon|bracket"] = { v = expected value, n = samples }
  const de = await disenchantValues();
  // The bank alt: the user's lowest character under level 10, when they have more than one.
  const mine = await db.character.findMany({ where: { userId, level: { not: null } }, select: { name: true, level: true }, orderBy: { level: "asc" } });
  const bank = mine.length > 1 && (mine[0].level ?? 99) < 10 ? mine[0].name : undefined;

  // Items on the market whose details the site does not know yet.
  const known = new Set((await db.itemInfo.findMany({ where: { classId: { not: null } }, select: { id: true } })).map((i) => i.id));
  const nameless = await db.$queryRaw<{ itemId: number }[]>`
    SELECT DISTINCT l."itemId" FROM "LedgerEntry" l
    LEFT JOIN "Item" i ON i.id = l."itemId"
    WHERE l."userId" = ${userId} AND l."itemId" IS NOT NULL AND (i.id IS NULL OR i.name = '')`;
  const want = [...new Set([...nameless.map((r) => r.itemId), ...prices.map((x) => x.itemId).filter((id) => !known.has(id))])].slice(0, WANT_LIMIT);

  const data: LuaOut = {
    version: ADDON_DATA_VERSION,
    generatedAt: Math.floor(now.getTime() / 1000),
    scanAt: latest ? Math.floor(latest.sourceUpdatedAt.getTime() / 1000) : 0,
    user: displayName,
    market: `${MARKET.region.toUpperCase()} PvP ${MARKET.faction[0].toUpperCase()}${MARKET.faction.slice(1)}`,
    cut: SETTINGS.cut,
    deposit: SETTINGS.depositPerListing,
    buyCap: cap.cap,
    p,
    calls,
    lists,
    sig,
    alerts,
    craft,
    vend,
    de,
    bank,
    signalsAt: signals[0] ? Math.floor(signals[0].at.getTime() / 1000) : 0,
    want,
  };
  return "-- Written by Forever Gold. Do not edit: the helper replaces this file.\n" + luaAssign("ForeverGoldData", data);
}
