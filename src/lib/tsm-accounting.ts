// What TSM's SavedVariables file (TradeSkillMaster.lua) knows about you: the
// accounting CSVs per realm (ruleset on Forever), gold over time and current
// gold per character, and professions. Format read from a 4.15 file on Forever,
// 2026-11-12; keys look like
//   r@PvP@internalData@csvSales
//   s@Bubbi Hunter - Alliance - PvP@internalData@goldLog

import { parseCsvRecords } from "./csv";
import { isTable, parseSavedVariables, type LuaValue } from "./lua-table";

export type LedgerKind = "SALE" | "BUY" | "EXPIRED" | "CANCELLED" | "INCOME" | "EXPENSE";

export type LedgerRow = {
  kind: LedgerKind;
  realm: string;
  character: string;
  itemString: string; // "" for income and expense
  itemId: number | null;
  stackSize: number;
  quantity: number;
  unitPrice: number; // copper per unit, sales and buys
  amount: number; // copper, income and expense
  detail: string; // sale or buy source, or income/expense type
  otherPlayer: string;
  time: Date;
};

export type GoldPoint = { character: string; faction: string; realm: string; at: Date; copper: number };

export type CharacterInfo = {
  name: string;
  faction: string;
  realm: string;
  classKey: string | null;
  money: number | null;
  professions: Record<string, { level: number; maxLevel: number }>;
};

export type TsmExport = {
  ledger: LedgerRow[];
  gold: GoldPoint[];
  characters: CharacterInfo[];
};

const CSV_KINDS: Record<string, LedgerKind> = {
  csvSales: "SALE",
  csvBuys: "BUY",
  csvExpired: "EXPIRED",
  csvCancelled: "CANCELLED",
  csvIncome: "INCOME",
  csvExpense: "EXPENSE",
};

const int = (v: string | undefined) => {
  const x = Number(v);
  return Number.isFinite(x) ? Math.round(x) : 0;
};

export function itemIdOf(itemString: string): number | null {
  const m = /^i:(\d+)/.exec(itemString);
  return m ? Number(m[1]) : null;
}

export class NotTsmFile extends Error {}

export function readTsmFile(text: string): TsmExport {
  const vars = parseSavedVariables(text);
  const db = vars.TradeSkillMasterDB;
  if (!isTable(db)) throw new NotTsmFile("This is not TSM's saved file: no TradeSkillMasterDB inside.");

  const ledger: LedgerRow[] = [];
  const gold: GoldPoint[] = [];
  const chars = new Map<string, CharacterInfo>();
  const charOf = (name: string, faction: string, realm: string) => {
    const key = `${name}|${faction}|${realm}`;
    let c = chars.get(key);
    if (!c) {
      c = { name, faction, realm, classKey: null, money: null, professions: {} };
      chars.set(key, c);
    }
    return c;
  };

  for (const [key, value] of Object.entries(db)) {
    let m = /^r@(.+)@internalData@(csv[A-Za-z]+)$/.exec(key);
    if (m && typeof value === "string" && CSV_KINDS[m[2]]) {
      const kind = CSV_KINDS[m[2]];
      const realm = m[1];
      for (const r of parseCsvRecords(value)) {
        const t = int(r.time);
        if (!t) continue;
        const itemString = kind === "INCOME" || kind === "EXPENSE" ? "" : (r.itemString ?? "");
        ledger.push({
          kind,
          realm,
          character: r.player ?? "",
          itemString,
          itemId: itemIdOf(itemString),
          stackSize: int(r.stackSize),
          quantity: int(r.quantity),
          unitPrice: int(r.price),
          amount: int(r.amount),
          detail: kind === "INCOME" || kind === "EXPENSE" ? (r.type ?? "") : (r.source ?? ""),
          otherPlayer: r.otherPlayer ?? "",
          time: new Date(t * 1000),
        });
      }
      continue;
    }

    m = /^s@(.+) - (Alliance|Horde|Neutral) - (.+)@internalData@(goldLog|money|classKey|playerProfessions)$/.exec(key);
    if (m) {
      const [, name, faction, realm, field] = m;
      const c = charOf(name, faction, realm);
      if (field === "goldLog" && typeof value === "string") {
        for (const r of parseCsvRecords(value)) {
          const minute = int(r.minute);
          if (minute) gold.push({ character: name, faction, realm, at: new Date(minute * 60_000), copper: int(r.copper) });
        }
      } else if (field === "money" && typeof value === "number") {
        c.money = Math.round(value);
      } else if (field === "classKey" && typeof value === "string") {
        c.classKey = value;
      } else if (field === "playerProfessions" && isTable(value)) {
        for (const [prof, p] of Object.entries(value)) {
          if (isTable(p)) c.professions[prof] = { level: num(p.level), maxLevel: num(p.maxLevel) };
        }
      }
    }
  }

  ledger.sort((a, b) => a.time.getTime() - b.time.getTime());
  return { ledger, gold, characters: [...chars.values()] };
}

const num = (v: LuaValue | undefined) => (typeof v === "number" ? v : 0);

// A stable identity for a ledger row, so uploading the same file twice adds
// nothing. TSM can hold identical rows (two equal sales in the same second);
// the occurrence number keeps them apart.
export function fingerprints(rows: LedgerRow[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = [r.kind, r.realm, r.character, r.itemString, r.stackSize, r.quantity, r.unitPrice, r.amount, r.detail, r.otherPlayer, r.time.getTime() / 1000].join("|");
    const k = (seen.get(base) ?? 0) + 1;
    seen.set(base, k);
    return `${base}#${k}`;
  });
}
