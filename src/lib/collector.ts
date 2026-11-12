import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { MARKET } from "@/config/player";
import {
  marketScope,
  marketUrl,
  parseMarketCsv,
  parseRegionCsv,
  regionUrl,
  scanTime,
  type MarketRow,
  type RegionRow,
} from "./tsm";

export type CollectResult = {
  kind: "MARKET" | "REGION";
  scope: string;
  status: "stored" | "unchanged" | "error";
  scanTime?: string;
  items?: number;
  detail?: string;
};

type Fetcher = typeof fetch;

// Fetch a file, skipping the download when the ETag still matches.
async function download(fetcher: Fetcher, url: string, etag: string | null) {
  const res = await fetcher(url, {
    headers: etag ? { "If-None-Match": etag } : {},
    cache: "no-store",
  });
  if (res.status === 304) return { notModified: true as const };
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return { notModified: false as const, text: await res.text(), etag: res.headers.get("etag") };
}

// Insert new items and refresh names that changed. Blank names never
// overwrite a known one.
async function upsertItems(tx: Prisma.TransactionClient, rows: { itemId: number; name: string }[]) {
  if (rows.length === 0) return;
  const ids = rows.map((r) => r.itemId);
  const names = rows.map((r) => r.name);
  await tx.$executeRaw`
    INSERT INTO "Item" ("id", "name", "updatedAt")
    SELECT id, name, now() FROM unnest(${ids}::int[], ${names}::text[]) AS t(id, name)
    ON CONFLICT ("id") DO UPDATE
      SET "name" = EXCLUDED."name", "updatedAt" = now()
      WHERE EXCLUDED."name" <> '' AND "Item"."name" <> EXCLUDED."name"`;
}

async function store<R extends MarketRow | RegionRow>(
  db: PrismaClient,
  kind: "MARKET" | "REGION",
  scope: string,
  rows: R[],
  etag: string | null,
  writeRows: (tx: Prisma.TransactionClient, snapshotId: number) => Promise<unknown>,
): Promise<CollectResult> {
  const t = scanTime(rows);
  if (!t) return { kind, scope, status: "error", detail: "file had no rows" };
  const existing = await db.snapshot.findUnique({
    where: { kind_scope_sourceUpdatedAt: { kind, scope, sourceUpdatedAt: t } },
    select: { id: true },
  });
  if (existing) {
    // Same scan, new ETag: remember it so the next poll can skip the download.
    if (etag) await db.snapshot.update({ where: { id: existing.id }, data: { etag } });
    return { kind, scope, status: "unchanged", scanTime: t.toISOString() };
  }
  try {
    await db.$transaction(
      async (tx) => {
        await upsertItems(tx, rows);
        const snap = await tx.snapshot.create({
          data: { kind, scope, sourceUpdatedAt: t, etag, itemCount: rows.length },
        });
        await writeRows(tx, snap.id);
      },
      { timeout: 60_000 },
    );
  } catch (e) {
    // Another run stored the same scan first.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { kind, scope, status: "unchanged", scanTime: t.toISOString() };
    }
    throw e;
  }
  return { kind, scope, status: "stored", scanTime: t.toISOString(), items: rows.length };
}

async function latestEtag(db: PrismaClient, kind: "MARKET" | "REGION", scope: string) {
  const s = await db.snapshot.findFirst({
    where: { kind, scope },
    orderBy: { fetchedAt: "desc" },
    select: { etag: true },
  });
  return s?.etag ?? null;
}

export async function collectMarket(db: PrismaClient, fetcher: Fetcher = fetch): Promise<CollectResult> {
  const scope = marketScope(MARKET);
  const got = await download(fetcher, marketUrl(MARKET), await latestEtag(db, "MARKET", scope));
  if (got.notModified) return { kind: "MARKET", scope, status: "unchanged", detail: "304" };
  const rows = parseMarketCsv(got.text);
  return store(db, "MARKET", scope, rows, got.etag, (tx, snapshotId) =>
    tx.marketPrice.createMany({
      data: rows.map((r) => ({
        snapshotId,
        itemId: r.itemId,
        marketValue: r.marketValue,
        minBuyout: r.minBuyout,
        recent: r.recent,
        historical: r.historical,
      })),
      skipDuplicates: true,
    }),
  );
}

export async function collectRegion(db: PrismaClient, fetcher: Fetcher = fetch): Promise<CollectResult> {
  const scope = MARKET.region;
  const got = await download(fetcher, regionUrl(scope), await latestEtag(db, "REGION", scope));
  if (got.notModified) return { kind: "REGION", scope, status: "unchanged", detail: "304" };
  const rows = parseRegionCsv(got.text);
  return store(db, "REGION", scope, rows, got.etag, (tx, snapshotId) =>
    tx.regionStat.createMany({
      data: rows.map((r) => ({
        snapshotId,
        itemId: r.itemId,
        marketValue: r.marketValue,
        historical: r.historical,
        avgSalePrice: r.avgSalePrice,
        saleRate: r.saleRate,
        soldPerDay: r.soldPerDay,
      })),
      skipDuplicates: true,
    }),
  );
}

// Keep every snapshot for KEEP_ALL_DAYS, then only the last one of each UTC
// day. A market snapshot is about 0.7 MB, and TSM publishes every few hours.
export const KEEP_ALL_DAYS = 14;

export async function pruneSnapshots(db: PrismaClient, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - KEEP_ALL_DAYS * 86_400_000);
  return db.$executeRaw`
    DELETE FROM "Snapshot" s
    WHERE s."sourceUpdatedAt" < ${cutoff}
      AND s.id NOT IN (
        SELECT DISTINCT ON (kind, scope, date_trunc('day', "sourceUpdatedAt")) id
        FROM "Snapshot"
        ORDER BY kind, scope, date_trunc('day', "sourceUpdatedAt"), "sourceUpdatedAt" DESC
      )`;
}

// Both files. One failing does not stop the other.
export async function collectAll(db: PrismaClient, fetcher: Fetcher = fetch): Promise<CollectResult[]> {
  const jobs: [CollectResult["kind"], string, () => Promise<CollectResult>][] = [
    ["MARKET", marketScope(MARKET), () => collectMarket(db, fetcher)],
    ["REGION", MARKET.region, () => collectRegion(db, fetcher)],
  ];
  const out: CollectResult[] = [];
  for (const [kind, scope, run] of jobs) {
    try {
      out.push(await run());
    } catch (e) {
      out.push({ kind, scope, status: "error", detail: e instanceof Error ? e.message : String(e) });
    }
  }
  if (out.some((r) => r.status === "stored")) await pruneSnapshots(db);
  return out;
}
