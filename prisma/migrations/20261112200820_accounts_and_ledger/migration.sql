-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "LedgerKind" AS ENUM ('SALE', 'BUY', 'EXPIRED', 'CANCELLED', 'INCOME', 'EXPENSE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "faction" TEXT NOT NULL,
    "realm" TEXT NOT NULL,
    "classKey" TEXT,
    "money" INTEGER,
    "professions" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "LedgerKind" NOT NULL,
    "realm" TEXT NOT NULL,
    "character" TEXT NOT NULL,
    "itemString" TEXT NOT NULL,
    "itemId" INTEGER,
    "stackSize" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "detail" TEXT NOT NULL,
    "otherPlayer" TEXT NOT NULL,
    "time" TIMESTAMP(3) NOT NULL,
    "fingerprint" TEXT NOT NULL,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoldSample" (
    "userId" TEXT NOT NULL,
    "character" TEXT NOT NULL,
    "faction" TEXT NOT NULL,
    "realm" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "copper" INTEGER NOT NULL,

    CONSTRAINT "GoldSample_pkey" PRIMARY KEY ("userId","character","realm","at")
);

-- CreateTable
CREATE TABLE "Upload" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "newRows" INTEGER NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Character_userId_name_faction_realm_key" ON "Character"("userId", "name", "faction", "realm");

-- CreateIndex
CREATE INDEX "LedgerEntry_userId_kind_time_idx" ON "LedgerEntry"("userId", "kind", "time");

-- CreateIndex
CREATE INDEX "LedgerEntry_userId_itemId_idx" ON "LedgerEntry"("userId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_userId_fingerprint_key" ON "LedgerEntry"("userId", "fingerprint");

-- CreateIndex
CREATE INDEX "Upload_userId_kind_at_idx" ON "Upload"("userId", "kind", "at");

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldSample" ADD CONSTRAINT "GoldSample_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
