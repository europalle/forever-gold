import { describe, expect, it } from "vitest";
import { toLua, luaAssign } from "../src/lib/lua-write";
import { parseSavedVariables } from "../src/lib/lua-table";

describe("toLua", () => {
  it("round-trips through the SavedVariables reader", () => {
    const v = {
      version: 1,
      cut: 0.05,
      user: 'Tyliøn "the" \\ bold\nnew',
      p: { 4232: { m: 209, v: 404, r: 90 }, 2318: { m: 45 } },
      lists: { sell: [4232, 2318], make: [{ id: 783, o: 4231, g: 35, vb: "Cure" }] },
      ["end"]: "reserved word key",
      ["has space"]: true,
      skip: null,
    };
    const lua = luaAssign("ForeverGoldData", v);
    const back = parseSavedVariables(lua).ForeverGoldData as Record<string, unknown>;
    expect(back.user).toBe(v.user);
    expect(back.cut).toBe(0.05);
    expect((back.p as Record<string, Record<string, number>>)["4232"]).toEqual({ m: 209, v: 404, r: 90 });
    expect(back.lists).toEqual({ sell: { "1": 4232, "2": 2318 }, make: { "1": { id: 783, o: 4231, g: 35, vb: "Cure" } } });
    expect(back["end"]).toBe("reserved word key");
    expect(back["has space"]).toBe(true);
    expect("skip" in back).toBe(false);
  });

  it("escapes control characters and cannot be broken out of", () => {
    const evil = '"]] } os.exit() --\x00\x1b';
    const lua = toLua({ s: evil });
    expect(lua).not.toContain("\x00");
    expect((parseSavedVariables(`X = ${lua}`).X as Record<string, string>).s).toBe(evil);
  });

  it("refuses unsafe global names", () => {
    expect(() => luaAssign("x; os.exit()", 1)).toThrow();
  });
});
