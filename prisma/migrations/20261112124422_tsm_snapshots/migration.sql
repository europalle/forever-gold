-- CreateEnum
CREATE TYPE "SnapshotKind" AS ENUM ('MARKET', 'REGION');

-- CreateTable
CREATE TABLE "Item" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" SERIAL NOT NULL,
    "kind" "SnapshotKind" NOT NULL,
    "scope" TEXT NOT NULL,
    "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "etag" TEXT,
    "itemCount" INTEGER NOT NULL,

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketPrice" (
    "snapshotId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "marketValue" INTEGER,
    "minBuyout" INTEGER,
    "recent" INTEGER,
    "historical" INTEGER,

    CONSTRAINT "MarketPrice_pkey" PRIMARY KEY ("snapshotId","itemId")
);

-- CreateTable
CREATE TABLE "RegionStat" (
    "snapshotId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "marketValue" INTEGER,
    "historical" INTEGER,
    "avgSalePrice" INTEGER,
    "saleRate" DOUBLE PRECISION,
    "soldPerDay" DOUBLE PRECISION,

    CONSTRAINT "RegionStat_pkey" PRIMARY KEY ("snapshotId","itemId")
);

-- CreateIndex
CREATE INDEX "Snapshot_kind_scope_fetchedAt_idx" ON "Snapshot"("kind", "scope", "fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Snapshot_kind_scope_sourceUpdatedAt_key" ON "Snapshot"("kind", "scope", "sourceUpdatedAt");

-- CreateIndex
CREATE INDEX "MarketPrice_itemId_idx" ON "MarketPrice"("itemId");

-- CreateIndex
CREATE INDEX "RegionStat_itemId_idx" ON "RegionStat"("itemId");

-- AddForeignKey
ALTER TABLE "MarketPrice" ADD CONSTRAINT "MarketPrice_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketPrice" ADD CONSTRAINT "MarketPrice_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegionStat" ADD CONSTRAINT "RegionStat_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegionStat" ADD CONSTRAINT "RegionStat_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
