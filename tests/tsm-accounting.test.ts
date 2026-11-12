import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSavedVariables, LuaParseError } from "../src/lib/lua-table";
import { fingerprints, readTsmFile, NotTsmFile } from "../src/lib/tsm-accounting";

const sample = readFileSync(new URL("./fixtures/TradeSkillMaster.sample.lua", import.meta.url), "utf8");

describe("parseSavedVariables", () => {
  it("reads nested tables, lists, escapes and several globals", () => {
    const v = parseSavedVariables(sample);
    const db = v.TradeSkillMasterDB as Record<string, unknown>;
    expect(db["note"]).toBe(`single 'quoted' and "double" \\ done`);
    expect(db["neg"]).toBe(-150);
    expect((db["p@Default@userData@groups"] as never)["Default"]["Mailing"]).toEqual({ "1": "#Default", override: true });
    expect((v.TSMItemInfoDB as Record<string, unknown>).revision).toBe("70888");
  });

  it("handles CRLF files", () => {
    expect(parseSavedVariables(readFileSync(new URL("./fixtures/crlf.lua", import.meta.url), "utf8"))).toEqual({ X: { a: "b" } });
  });

  it("refuses code instead of running it", () => {
    expect(() => parseSavedVariables('X = os.execute("rm -rf /")')).toThrow(LuaParseError);
    expect(() => parseSavedVariables("X = { f = function() end }")).toThrow(LuaParseError);
    expect(() => parseSavedVariables('X = "unterminated')).toThrow(LuaParseError);
  });
});

describe("readTsmFile", () => {
  const out = readTsmFile(sample);

  it("reads every ledger kind with units and times", () => {
    const kinds = out.ledger.map((r) => r.kind).sort();
    expect(kinds).toEqual(["BUY", "EXPENSE", "EXPIRED", "SALE", "SALE", "SALE"]);
    const sale = out.ledger.find((r) => r.itemString === "i:2318")!;
    expect(sale).toMatchObject({ realm: "PvP", character: "Testa Bank", quantity: 10, unitPrice: 42, itemId: 2318, detail: "Auction" });
    expect(sale.time.toISOString()).toBe("2026-11-12T11:34:34.000Z");
    const buy = out.ledger.find((r) => r.kind === "BUY")!;
    expect(buy).toMatchObject({ itemString: "i:6602::1:12736", itemId: 6602, unitPrice: 979 });
    expect(out.ledger.find((r) => r.kind === "EXPENSE")).toMatchObject({ amount: 510, detail: "Postage", itemString: "" });
  });

  it("reads characters and gold over time", () => {
    const hunter = out.characters.find((c) => c.name === "Testa Hunter")!;
    expect(hunter).toMatchObject({ faction: "Alliance", realm: "PvP", classKey: "HUNTER", money: 55606 });
    expect(hunter.professions.Leatherworking).toEqual({ level: 105, maxLevel: 150 });
    expect(out.gold).toHaveLength(2);
    expect(out.gold[1]).toMatchObject({ character: "Testa Hunter", copper: 60000 });
  });

  it("keeps identical rows apart and is stable across uploads", () => {
    const f = fingerprints(out.ledger);
    expect(new Set(f).size).toBe(f.length);
    expect(fingerprints(readTsmFile(sample).ledger)).toEqual(f);
  });

  it("says plainly when a file is not TSM's", () => {
    expect(() => readTsmFile("Other = {}")).toThrow(NotTsmFile);
  });
});
