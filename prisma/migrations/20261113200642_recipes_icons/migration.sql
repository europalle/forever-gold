-- AlterTable
ALTER TABLE "ItemInfo" ADD COLUMN     "icon" TEXT,
ADD COLUMN     "iconTried" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" INTEGER NOT NULL,
    "profession" TEXT NOT NULL,
    "tier" TEXT,
    "category" TEXT,
    "name" TEXT NOT NULL,
    "outputId" INTEGER,
    "outputQty" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "reagents" JSONB NOT NULL DEFAULT '[]',
    "fetchedAt" TIMESTAMP(3),

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Recipe_profession_idx" ON "Recipe"("profession");

-- CreateIndex
CREATE INDEX "Recipe_outputId_idx" ON "Recipe"("outputId");
