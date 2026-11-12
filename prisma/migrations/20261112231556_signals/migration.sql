-- CreateTable
CREATE TABLE "SupplyPoint" (
    "itemId" INTEGER NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "minUnit" INTEGER NOT NULL,
    "totalQty" INTEGER NOT NULL,

    CONSTRAINT "SupplyPoint_pkey" PRIMARY KEY ("itemId","at")
);

-- CreateTable
CREATE TABLE "ItemSignal" (
    "itemId" INTEGER NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "condition" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "strength" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "fair" INTEGER NOT NULL,
    "expected" INTEGER NOT NULL,
    "change24" DOUBLE PRECISION,
    "slope" DOUBLE PRECISION,
    "z" DOUBLE PRECISION NOT NULL,
    "supplyRatio" DOUBLE PRECISION,
    "supplyChange" DOUBLE PRECISION,
    "liquid" BOOLEAN NOT NULL,
    "soldPerDay" DOUBLE PRECISION,

    CONSTRAINT "ItemSignal_pkey" PRIMARY KEY ("itemId")
);

-- CreateTable
CREATE TABLE "SignalEvent" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "condition" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "strength" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "fair" INTEGER NOT NULL,

    CONSTRAINT "SignalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplyPoint_at_idx" ON "SupplyPoint"("at");

-- CreateIndex
CREATE INDEX "ItemSignal_action_strength_idx" ON "ItemSignal"("action", "strength");

-- CreateIndex
CREATE INDEX "SignalEvent_itemId_at_idx" ON "SignalEvent"("itemId", "at");

-- CreateIndex
CREATE INDEX "SignalEvent_at_idx" ON "SignalEvent"("at");
