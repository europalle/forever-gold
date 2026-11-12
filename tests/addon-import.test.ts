import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NotAddonFile, readAddonFile } from "../src/lib/addon-import";

const sample = readFileSync(new URL("./fixtures/ForeverGold.sample.lua", import.meta.url), "utf8");

describe("readAddonFile", () => {
  const out = readAddonFile(sample);

  it("reads characters with gathering professions, inventory, auctions and recipes", () => {
    const c = out.chars[0];
    expect(c).toMatchObject({ name: "Testa Hunter", faction: "Alliance", level: 30, money: 55606, classKey: "HUNTER" });
    expect(c.professions.Skinning).toEqual({ level: 185, maxLevel: 225 });
    expect(c.inventory.bags).toEqual({ "4232": 12, "783": 7 }); // the negative id is dropped
    expect(c.inventory.bank).toEqual({ "4304": 40 });
    expect(c.auctions).toEqual([{ id: 4234, n: 20, buyout: 4200, bid: null, left: 7000 }]);
    expect(c.recipes.Leatherworking["3816"]).toEqual({ name: "Cured Light Hide", out: 4231, qty: 1, reag: [[783, 1], [4289, 1]], cd: null });
  });

  it("reads item details and drops malformed fields", () => {
    expect(out.items.find((i) => i.id === 4232)).toMatchObject({ quality: 1, itemLevel: 25, classId: 7, vendorSell: 50, maxStack: 20 });
    expect(out.items.find((i) => i.id === 2000000)).toMatchObject({ quality: null });
  });

  it("reads sale invoices", () => {
    expect(out.invoices).toHaveLength(1);
    expect(out.invoices[0]).toMatchObject({ itemName: "Medium Hide", quantity: 10, buyout: 3200, deposit: 100, cut: 160 });
  });

  it("refuses other files", () => {
    expect(() => readAddonFile("TradeSkillMasterDB = {}")).toThrow(NotAddonFile);
  });
});
