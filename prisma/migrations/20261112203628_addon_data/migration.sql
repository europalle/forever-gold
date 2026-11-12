-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "addonAt" TIMESTAMP(3),
ADD COLUMN     "auctions" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "inventory" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "level" INTEGER,
ADD COLUMN     "recipes" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "AhInvoice" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "time" TIMESTAMP(3) NOT NULL,
    "character" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "buyout" INTEGER NOT NULL,
    "bid" INTEGER NOT NULL,
    "deposit" INTEGER NOT NULL,
    "cut" INTEGER NOT NULL,
    "net" INTEGER,

    CONSTRAINT "AhInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AhInvoice_userId_key_key" ON "AhInvoice"("userId", "key");

-- AddForeignKey
ALTER TABLE "AhInvoice" ADD CONSTRAINT "AhInvoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
