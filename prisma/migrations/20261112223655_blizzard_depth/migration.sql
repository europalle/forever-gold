-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "DepthSnapshot" (
    "id" SERIAL NOT NULL,
    "houseId" INTEGER NOT NULL,
    "lastModified" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "itemCount" INTEGER NOT NULL,
    "auctionCount" INTEGER NOT NULL,

    CONSTRAINT "DepthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepthItem" (
    "snapshotId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "minUnit" INTEGER NOT NULL,
    "qtyAtMin" INTEGER NOT NULL,
    "qtyNearMin" INTEGER NOT NULL,
    "totalQty" INTEGER NOT NULL,
    "auctions" INTEGER NOT NULL,
    "ladder" JSONB NOT NULL,

    CONSTRAINT "DepthItem_pkey" PRIMARY KEY ("snapshotId","itemId")
);

-- CreateIndex
CREATE UNIQUE INDEX "DepthSnapshot_houseId_lastModified_key" ON "DepthSnapshot"("houseId", "lastModified");

-- CreateIndex
CREATE INDEX "DepthItem_itemId_idx" ON "DepthItem"("itemId");

-- AddForeignKey
ALTER TABLE "DepthItem" ADD CONSTRAINT "DepthItem_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "DepthSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
