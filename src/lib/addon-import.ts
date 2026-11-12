// Reads the Forever Gold addon's saved file (ForeverGold.lua, global
// ForeverGoldDB) and stores it for one user. Every field is checked: the file
// comes from a player's PC, so nothing in it is trusted.

import type { PrismaClient } from "@/generated/prisma/client";
import { isTable, parseSavedVariables, type LuaTable, type LuaValue } from "./lua-table";

export class NotAddonFile extends Error {}

const int = (v: LuaValue | undefined, min = 0, max = 2_147_483_647): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : null;
const str = (v: LuaValue | undefined, max = 80): string | null => (typeof v === "string" && v.length <= max ? v : null);
const tbl = (v: LuaValue | undefined): LuaTable => (isTable(v) ? v : {});
// Lua lists arrive as tables keyed "1", "2", ...
const list = (v: LuaValue | undefined): LuaValue[] =>
  Object.entries(tbl(v))
    .filter(([k]) => /^\d+$/.test(k))
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([, x]) => x);

function counts(v: LuaValue | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(tbl(v)).slice(0, 2000)) {
    const id = int(Number(k), 1);
    const c = int(n, 1, 1_000_000);
    if (id && c) out[id] = c;
  }
  return out;
}

export type AddonChar = {
  name: string;
  realm: string | null;
  faction: string | null;
  classKey: string | null;
  level: number | null;
  money: number | null;
  professions: Record<string, { level: number; maxLevel: number }>;
  inventory: { bags: Record<string, number>; bank: Record<string, number>; mail: Record<string, number> };
  auctions: { id: number; n: number; buyout: number | null; bid: number | null; left: number | null }[];
  recipes: Record<string, Record<string, { name: string | null; out: number | null; qty: number | null; reag: [number, number][]; cd: number | null }>>;
};

export type AddonItem = {
  id: number;
  name: string | null;
  quality: number | null;
  itemLevel: number | null;
  reqLevel: number | null;
  classId: number | null;
  subclassId: number | null;
  equipLoc: string | null;
  vendorSell: number | null;
  maxStack: number | null;
  bindType: number | null;
};

export type AddonInvoice = {
  key: string;
  time: Date;
  character: string;
  itemName: string;
  quantity: number;
  buyout: number;
  bid: number;
  deposit: number;
  cut: number;
  net: number | null;
};

export type AddonLoot = {
  key: string;
  time: Date;
  kind: string;
  npcId: number | null;
  npcName: string | null;
  npcLevel: number | null;
  mapId: number | null;
  sourceItemId: number | null;
  items: [number, number][];
};

export type AddonVendorItem = {
  npcId: number;
  itemId: number;
  vendorName: string | null;
  mapId: number | null;
  price: number;
  stack: number;
  stock: number | null;
  extended: boolean;
  seenAt: Date;
};

export type AddonTrainerService = {
  npcId: number;
  name: string;
  trainerName: string | null;
  mapId: number | null;
  cost: number | null;
  skill: string | null;
  skillLevel: number | null;
  levelReq: number | null;
  itemId: number | null;
  category: string | null;
  seenAt: Date;
};

const LOOT_KINDS = new Set(["loot", "skin", "herb", "mine", "fish", "disenchant"]);

export function readAddonFile(text: string): {
  chars: AddonChar[];
  items: AddonItem[];
  invoices: AddonInvoice[];
  loot: AddonLoot[];
  vendorItems: AddonVendorItem[];
  trainerServices: AddonTrainerService[];
} {
  const db = parseSavedVariables(text).ForeverGoldDB;
  if (!isTable(db)) throw new NotAddonFile("This is not the Forever Gold addon's saved file: no ForeverGoldDB inside.");

  const chars: AddonChar[] = [];
  for (const [name, raw] of Object.entries(tbl(db.chars)).slice(0, 50)) {
    if (!name || name.length > 48 || !isTable(raw)) continue;
    const professions: AddonChar["professions"] = {};
    for (const [prof, p] of Object.entries(tbl(raw.profs)).slice(0, 20)) {
      const level = int(tbl(p).lvl, 0, 1000);
      if (prof.length <= 40 && level !== null) professions[prof] = { level, maxLevel: int(tbl(p).max, 0, 1000) ?? 0 };
    }
    const recipes: AddonChar["recipes"] = {};
    for (const [prof, rs] of Object.entries(tbl(raw.recipes)).slice(0, 20)) {
      if (prof.length > 40) continue;
      const out: AddonChar["recipes"][string] = {};
      for (const [rid, r] of Object.entries(tbl(rs)).slice(0, 2000)) {
        if (!int(Number(rid), 1)) continue;
        const rt = tbl(r);
        out[rid] = {
          name: str(rt.name),
          out: int(rt.out, 1),
          qty: int(rt.qty, 1, 1000),
          reag: list(rt.reag)
            .map((x) => list(x))
            .map(([id, q]) => [int(id, 1), int(q, 1, 1000)] as const)
            .filter((x): x is [number, number] => x[0] !== null && x[1] !== null)
            .slice(0, 12),
          cd: int(rt.cd, 0, 10_000_000),
        };
      }
      recipes[prof] = out;
    }
    chars.push({
      name,
      realm: str(raw.realm),
      faction: str(raw.faction, 20),
      classKey: str(raw.class, 20),
      level: int(raw.level, 1, 100),
      money: int(raw.money),
      professions,
      inventory: { bags: counts(raw.bags), bank: counts(raw.bank), mail: counts(raw.mail) },
      auctions: list(raw.auctions)
        .slice(0, 500)
        .map((a) => tbl(a))
        .map((a) => ({ id: int(a.id, 1) ?? 0, n: int(a.n, 1, 1_000_000) ?? 1, buyout: int(a.buyout), bid: int(a.bid), left: int(a.left) }))
        .filter((a) => a.id > 0),
      recipes,
    });
  }

  const items: AddonItem[] = [];
  for (const [k, raw] of Object.entries(tbl(db.items)).slice(0, 60_000)) {
    const id = int(Number(k), 1);
    if (!id || !isTable(raw)) continue;
    items.push({
      id,
      name: str(raw.n, 120),
      quality: int(raw.q, 0, 10),
      itemLevel: int(raw.il, 0, 1000),
      reqLevel: int(raw.rl, 0, 100),
      classId: int(raw.c, 0, 100),
      subclassId: int(raw.s, 0, 100),
      equipLoc: str(raw.e, 40),
      vendorSell: int(raw.v),
      maxStack: int(raw.st, 1, 100_000),
      bindType: int(raw.b, 0, 10),
    });
  }

  const invoices: AddonInvoice[] = [];
  for (const [key, raw] of Object.entries(tbl(db.invoices)).slice(0, 20_000)) {
    if (key.length > 300 || !isTable(raw)) continue;
    const t = int(raw.t, 1);
    const itemName = str(raw.item, 120);
    if (!t || !itemName) continue;
    invoices.push({
      key,
      time: new Date(t * 1000),
      character: str(raw.char, 48) ?? "",
      itemName,
      quantity: int(raw.qty, 1, 1_000_000) ?? 1,
      buyout: int(raw.buyout) ?? 0,
      bid: int(raw.bid) ?? 0,
      deposit: int(raw.deposit) ?? 0,
      cut: int(raw.cut) ?? 0,
      net: int(raw.net),
    });
  }
  const loot: AddonLoot[] = [];
  for (const raw of list(db.loot).slice(-5000)) {
    const e = tbl(raw);
    const t = int(e.t, 1);
    const kind = str(e.k, 20);
    if (!t || !kind || !LOOT_KINDS.has(kind)) continue;
    const items = list(e.i)
      .map((x) => list(x))
      .map(([id, q]) => [int(id, 1), int(q, 1, 10_000)] as const)
      .filter((x): x is [number, number] => x[0] !== null && x[1] !== null)
      .slice(0, 20);
    if (!items.length) continue;
    const ev = {
      time: new Date(t * 1000),
      kind,
      npcId: int(e.npc, 1),
      npcName: str(e.nm, 60),
      npcLevel: int(e.lvl, 1, 100),
      mapId: int(e.m, 1),
      sourceItemId: int(e.src, 1),
      items,
    };
    loot.push({ key: [t, kind, ev.npcId, ev.sourceItemId, JSON.stringify(items)].join("|"), ...ev });
  }

  const vendorItems: AddonVendorItem[] = [];
  for (const [npc, raw] of Object.entries(tbl(db.vendors)).slice(0, 500)) {
    const npcId = int(Number(npc), 1);
    const v = tbl(raw);
    const t = int(v.t, 1);
    if (!npcId || !t) continue;
    for (const [item, r] of Object.entries(tbl(v.items)).slice(0, 300)) {
      const itemId = int(Number(item), 1);
      const x = tbl(r);
      const price = int(x.p);
      if (!itemId || price === null) continue;
      vendorItems.push({
        npcId,
        itemId,
        vendorName: str(v.name, 60),
        mapId: int(v.m, 1),
        price,
        stack: int(x.q, 1, 10_000) ?? 1,
        stock: int(x.n, 0, 10_000),
        extended: x.x === 1 || x.x === true,
        seenAt: new Date(t * 1000),
      });
    }
  }

  const trainerServices: AddonTrainerService[] = [];
  for (const [npc, raw] of Object.entries(tbl(db.trainers)).slice(0, 100)) {
    const npcId = int(Number(npc), 1);
    const v = tbl(raw);
    const t = int(v.t, 1);
    if (!npcId || !t) continue;
    const seen = new Set<string>();
    for (const r of list(v.services).slice(0, 400)) {
      const x = tbl(r);
      const name = str(x.n, 100);
      if (!name || seen.has(name)) continue;
      seen.add(name);
      trainerServices.push({
        npcId,
        name,
        trainerName: str(v.name, 60),
        mapId: int(v.m, 1),
        cost: int(x.c),
        skill: str(x.sk, 40),
        skillLevel: int(x.s, 0, 1000),
        levelReq: int(x.l, 0, 100),
        itemId: int(x.item, 1),
        category: str(x.st, 20),
        seenAt: new Date(t * 1000),
      });
    }
  }

  return { chars, items, invoices, loot, vendorItems, trainerServices };
}

export type AddonImportResult = {
  characters: string[];
  items: number;
  newItems: number;
  invoices: number;
  newInvoices: number;
  newLoot: number;
  vendorItems: number;
  trainerServices: number;
};

export async function importAddon(db: PrismaClient, userId: string, text: string, bytes: number): Promise<AddonImportResult> {
  const data = readAddonFile(text);
  return db.$transaction(
    async (tx) => {
      for (const c of data.chars) {
        // One record per character, whether TSM or the addon saw it first.
        const existing = await tx.character.findFirst({
          where: { userId, name: c.name, ...(c.faction ? { faction: c.faction } : {}) },
          orderBy: { updatedAt: "desc" },
        });
        const fields = {
          level: c.level,
          money: c.money ?? existing?.money ?? null,
          classKey: c.classKey ?? existing?.classKey ?? null,
          professions: { ...((existing?.professions ?? {}) as object), ...c.professions },
          inventory: c.inventory,
          auctions: c.auctions,
          recipes: { ...((existing?.recipes ?? {}) as object), ...c.recipes },
          addonAt: new Date(),
        };
        if (existing) await tx.character.update({ where: { id: existing.id }, data: fields });
        else
          await tx.character.create({
            data: { userId, name: c.name, faction: c.faction ?? "", realm: c.realm ?? "", ...fields },
          });
      }
      const items = await tx.itemInfo.createMany({ data: data.items, skipDuplicates: true });
      // Names: fill them in on item details and on the site-wide item list,
      // where TSM's files had none (items nobody is listing right now).
      const named = data.items.filter((i) => i.name);
      if (named.length) {
        const ids = named.map((i) => i.id);
        const names = named.map((i) => i.name!);
        await tx.$executeRaw`
          UPDATE "ItemInfo" ii SET name = t.name
          FROM unnest(${ids}::int[], ${names}::text[]) AS t(id, name)
          WHERE ii.id = t.id AND ii.name IS NULL`;
        await tx.$executeRaw`
          INSERT INTO "Item" ("id", "name", "updatedAt")
          SELECT id, name, now() FROM unnest(${ids}::int[], ${names}::text[]) AS t(id, name)
          ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "updatedAt" = now()
            WHERE "Item"."name" = ''`;
      }
      const loot = await tx.lootEvent.createMany({
        data: data.loot.map((l) => ({ userId, ...l })),
        skipDuplicates: true,
      });
      // Vendors and trainers are game data: the latest sighting wins.
      for (const v of data.vendorItems) {
        await tx.vendorItem.upsert({
          where: { npcId_itemId: { npcId: v.npcId, itemId: v.itemId } },
          create: v,
          update: v,
        });
      }
      for (const t of data.trainerServices) {
        await tx.trainerService.upsert({
          where: { npcId_name: { npcId: t.npcId, name: t.name } },
          create: t,
          update: t,
        });
      }
      const invoices = await tx.ahInvoice.createMany({
        data: data.invoices.map((i) => ({ userId, ...i })),
        skipDuplicates: true,
      });
      await tx.upload.create({ data: { userId, kind: "addon", bytes, newRows: invoices.count } });
      return {
        characters: data.chars.map((c) => c.name),
        items: data.items.length,
        newItems: items.count,
        invoices: data.invoices.length,
        newInvoices: invoices.count,
        newLoot: loot.count,
        vendorItems: data.vendorItems.length,
        trainerServices: data.trainerServices.length,
      };
    },
    { timeout: 60_000 },
  );
}
