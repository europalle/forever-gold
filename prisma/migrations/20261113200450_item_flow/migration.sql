-- AlterTable
ALTER TABLE "ItemSignal" ADD COLUMN     "daysCover" DOUBLE PRECISION,
ADD COLUMN     "soldHere" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "ItemFlow" (
    "itemId" INTEGER NOT NULL,
    "day" DATE NOT NULL,
    "sold" INTEGER NOT NULL,

    CONSTRAINT "ItemFlow_pkey" PRIMARY KEY ("itemId","day")
);

-- CreateTable
CREATE TABLE "FlowDay" (
    "day" DATE NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "FlowDay_pkey" PRIMARY KEY ("day")
);

-- CreateIndex
CREATE INDEX "ItemFlow_day_idx" ON "ItemFlow"("day");
