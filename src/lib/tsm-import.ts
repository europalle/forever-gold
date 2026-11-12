import type { PrismaClient } from "@/generated/prisma/client";
import { fingerprints, readTsmFile } from "./tsm-accounting";

export type ImportResult = {
  ledgerRows: number;
  newLedgerRows: number;
  goldPoints: number;
  characters: string[];
};

// Store what a TSM file holds for one user. Re-uploading the same or an older
// file adds nothing: ledger rows and gold samples are keyed by their content.
export async function importTsm(db: PrismaClient, userId: string, text: string, bytes: number): Promise<ImportResult> {
  const data = readTsmFile(text);
  const fps = fingerprints(data.ledger);

  return db.$transaction(
    async (tx) => {
      for (const c of data.characters) {
        const fields = {
          classKey: c.classKey,
          money: c.money,
          professions: c.professions,
        };
        await tx.character.upsert({
          where: { userId_name_faction_realm: { userId, name: c.name, faction: c.faction, realm: c.realm } },
          create: { userId, name: c.name, faction: c.faction, realm: c.realm, ...fields },
          update: fields,
        });
      }
      const created = await tx.ledgerEntry.createMany({
        data: data.ledger.map((r, i) => ({
          userId,
          kind: r.kind,
          realm: r.realm,
          character: r.character,
          itemString: r.itemString,
          itemId: r.itemId,
          stackSize: r.stackSize,
          quantity: r.quantity,
          unitPrice: r.unitPrice,
          amount: r.amount,
          detail: r.detail,
          otherPlayer: r.otherPlayer,
          time: r.time,
          fingerprint: fps[i],
        })),
        skipDuplicates: true,
      });
      await tx.goldSample.createMany({
        data: data.gold.map((g) => ({ userId, character: g.character, faction: g.faction, realm: g.realm, at: g.at, copper: g.copper })),
        skipDuplicates: true,
      });
      await tx.upload.create({ data: { userId, kind: "tsm", bytes, newRows: created.count } });
      return {
        ledgerRows: data.ledger.length,
        newLedgerRows: created.count,
        goldPoints: data.gold.length,
        characters: data.characters.map((c) => c.name),
      };
    },
    { timeout: 60_000 },
  );
}
