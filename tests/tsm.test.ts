import { describe, expect, it } from "vitest";
import { parseCsv } from "../src/lib/csv";
import { marketScope, marketUrl, parseMarketCsv, parseRegionCsv, regionUrl, scanTime } from "../src/lib/tsm";

describe("parseCsv", () => {
  it("reads quoted fields with doubled quotes and commas", () => {
    const text = 'a,b\n3041,"""Mage-Eye"" Blunderbuss"\n3899,"Legends of the Gurubashi, Volume 3"\r\n';
    expect(parseCsv(text)).toEqual([
      ["a", "b"],
      ["3041", '"Mage-Eye" Blunderbuss'],
      ["3899", "Legends of the Gurubashi, Volume 3"],
    ]);
  });

  it("keeps empty fields and ignores a missing final newline", () => {
    expect(parseCsv("1,,3\n4,5,")).toEqual([
      ["1", "", "3"],
      ["4", "5", ""],
    ]);
  });
});

describe("TSM files", () => {
  it("builds the paths that were tested live", () => {
    const m = { region: "eu", ruleset: "pvp", faction: "alliance" };
    expect(marketScope(m)).toBe("eu-pvp-alliance");
    expect(marketUrl(m)).toBe("https://public-data.tradeskillmaster.com/forever/eu/realm/pvp-alliance/items.csv");
    expect(regionUrl("eu")).toBe("https://public-data.tradeskillmaster.com/forever/eu/region/items.csv");
  });

  it("parses market rows and treats 0 listings as none", () => {
    const rows = parseMarketCsv(
      "itemId,name,marketValue,minBuyout,recent,historical,updatedAt\n" +
        "4232,Medium Hide,431,239,242,498,2026-11-12T09:25:17Z\n" +
        "3024,\"BKP 2700 \"\"Enforcer\"\"\",5500,0,0,5500,2026-11-12T09:25:17Z\n" +
        "287028,,304200,354200,354200,254200,2026-11-12T09:25:17Z\n" +
        "bad,row,1,1,1,1,2026-11-12T09:25:17Z\n",
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ itemId: 4232, minBuyout: 239, marketValue: 431, historical: 498 });
    expect(rows[1]).toMatchObject({ name: 'BKP 2700 "Enforcer"', minBuyout: null, recent: null });
    expect(rows[2].name).toBe("");
    expect(scanTime(rows)?.toISOString()).toBe("2026-11-12T09:25:17.000Z");
  });

  it("parses region rows and keeps no-sales items unknown", () => {
    const rows = parseRegionCsv(
      "itemId,name,marketValue,historical,avgSalePrice,saleRate,soldPerDay,updatedAt\n" +
        "4232,Medium Hide,612,837,409,0.895,548.635,2026-11-11T00:20:19Z\n" +
        "15407,Cured Rugged Hide,302787,256641,0,0,0,2026-11-11T00:20:19Z\n" +
        "271646,How to Make Friend,22222251710,0,0,0,0,2026-11-11T00:20:19Z\n",
    );
    expect(rows[0]).toMatchObject({ avgSalePrice: 409, saleRate: 0.895, soldPerDay: 548.635 });
    expect(rows[1]).toMatchObject({ avgSalePrice: null, saleRate: null, soldPerDay: null, marketValue: 302787 });
    expect(rows[2].marketValue).toBeNull();
  });
});
