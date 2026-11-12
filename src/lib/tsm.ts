// TSM's public price files: static CSVs, no key. Checked 2026-11-12.
//   market: /forever/{region}/realm/{ruleset}-{faction}/items.csv
//     itemId,name,marketValue,minBuyout,recent,historical,updatedAt
//   region: /forever/{region}/region/items.csv
//     itemId,name,marketValue,historical,avgSalePrice,saleRate,soldPerDay,updatedAt
// Prices are copper. A 0 minBuyout or recent means nothing was listed.

import { parseCsvRecords } from "./csv";

export const TSM_BASE = "https://public-data.tradeskillmaster.com";

export type Market = { region: string; ruleset: string; faction: string };

export const marketScope = (m: Market) => `${m.region}-${m.ruleset}-${m.faction}`;
export const marketUrl = (m: Market) =>
  `${TSM_BASE}/forever/${m.region}/realm/${m.ruleset}-${m.faction}/items.csv`;
export const regionUrl = (region: string) => `${TSM_BASE}/forever/${region}/region/items.csv`;

export type MarketRow = {
  itemId: number;
  name: string;
  marketValue: number | null;
  minBuyout: number | null;
  recent: number | null;
  historical: number | null;
  updatedAt: Date;
};

export type RegionRow = {
  itemId: number;
  name: string;
  marketValue: number | null;
  historical: number | null;
  avgSalePrice: number | null;
  saleRate: number | null;
  soldPerDay: number | null;
  updatedAt: Date;
};

// Prices are stored as 32-bit integers: up to about 214,748g. Anything above is
// a joke listing (one book sat at 2.2 million gold on 2026-11-11), kept as unknown.
export const MAX_COPPER = 2_147_483_647;

// Copper field. Empty or non-numeric is unknown; 0 is "none" when zeroIsNone.
function copper(v: string | undefined, zeroIsNone: boolean): number | null {
  if (v === undefined || v.trim() === "") return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0 || n > MAX_COPPER) return null;
  if (n === 0 && zeroIsNone) return null;
  return n;
}

function decimal(v: string | undefined): number | null {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function rowBase(r: Record<string, string>) {
  const itemId = Number(r.itemId);
  const updatedAt = new Date(r.updatedAt);
  if (!Number.isInteger(itemId) || itemId <= 0 || Number.isNaN(updatedAt.getTime())) return null;
  return { itemId, name: r.name ?? "", updatedAt };
}

export function parseMarketCsv(text: string): MarketRow[] {
  const out: MarketRow[] = [];
  for (const r of parseCsvRecords(text)) {
    const base = rowBase(r);
    if (!base) continue;
    out.push({
      ...base,
      marketValue: copper(r.marketValue, true),
      minBuyout: copper(r.minBuyout, true),
      recent: copper(r.recent, true),
      historical: copper(r.historical, true),
    });
  }
  return out;
}

export function parseRegionCsv(text: string): RegionRow[] {
  const out: RegionRow[] = [];
  for (const r of parseCsvRecords(text)) {
    const base = rowBase(r);
    if (!base) continue;
    const avgSalePrice = copper(r.avgSalePrice, true);
    const saleRate = decimal(r.saleRate);
    const soldPerDay = decimal(r.soldPerDay);
    // TSM writes 0,0,0 for items with no recorded sales. Keep that as unknown,
    // not as "never sells": the market is days old.
    const noSales = avgSalePrice === null && !saleRate && !soldPerDay;
    out.push({
      ...base,
      marketValue: copper(r.marketValue, true),
      historical: copper(r.historical, true),
      avgSalePrice,
      saleRate: noSales ? null : saleRate,
      soldPerDay: noSales ? null : soldPerDay,
    });
  }
  return out;
}

// The scan time of a file: the newest updatedAt among its rows.
export function scanTime(rows: { updatedAt: Date }[]): Date | null {
  let t: Date | null = null;
  for (const r of rows) if (!t || r.updatedAt > t) t = r.updatedAt;
  return t;
}
