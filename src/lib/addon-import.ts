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

export function readAddonFile(text: string): { chars: AddonChar[]; items: AddonItem[]; invoices: AddonInvoice[] } {
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
  return { chars, items, invoices };
}

export type AddonImportResult = { characters: string[]; items: number; newItems: number; invoices: number; newInvoices: number };

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
      };
    },
    { timeout: 60_000 },
  );
}
