-- AlterTable
ALTER TABLE "ItemInfo" ADD COLUMN     "name" TEXT;

-- CreateTable
CREATE TABLE "LootEvent" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "time" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "npcId" INTEGER,
    "npcName" TEXT,
    "npcLevel" INTEGER,
    "mapId" INTEGER,
    "sourceItemId" INTEGER,
    "items" JSONB NOT NULL,

    CONSTRAINT "LootEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorItem" (
    "npcId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "vendorName" TEXT,
    "mapId" INTEGER,
    "price" INTEGER NOT NULL,
    "stack" INTEGER NOT NULL,
    "stock" INTEGER,
    "extended" BOOLEAN NOT NULL DEFAULT false,
    "seenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorItem_pkey" PRIMARY KEY ("npcId","itemId")
);

-- CreateTable
CREATE TABLE "TrainerService" (
    "npcId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "trainerName" TEXT,
    "mapId" INTEGER,
    "cost" INTEGER,
    "skill" TEXT,
    "skillLevel" INTEGER,
    "levelReq" INTEGER,
    "itemId" INTEGER,
    "category" TEXT,
    "seenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainerService_pkey" PRIMARY KEY ("npcId","name")
);

-- CreateIndex
CREATE INDEX "LootEvent_kind_npcId_idx" ON "LootEvent"("kind", "npcId");

-- CreateIndex
CREATE INDEX "LootEvent_kind_sourceItemId_idx" ON "LootEvent"("kind", "sourceItemId");

-- CreateIndex
CREATE UNIQUE INDEX "LootEvent_userId_key_key" ON "LootEvent"("userId", "key");

-- CreateIndex
CREATE INDEX "VendorItem_itemId_idx" ON "VendorItem"("itemId");

-- CreateIndex
CREATE INDEX "TrainerService_itemId_idx" ON "TrainerService"("itemId");

-- AddForeignKey
ALTER TABLE "LootEvent" ADD CONSTRAINT "LootEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
