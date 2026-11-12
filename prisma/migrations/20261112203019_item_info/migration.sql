-- CreateTable
CREATE TABLE "ItemInfo" (
    "id" INTEGER NOT NULL,
    "quality" INTEGER,
    "itemLevel" INTEGER,
    "reqLevel" INTEGER,
    "classId" INTEGER,
    "subclassId" INTEGER,
    "equipLoc" TEXT,
    "vendorSell" INTEGER,
    "maxStack" INTEGER,
    "bindType" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemInfo_pkey" PRIMARY KEY ("id")
);
