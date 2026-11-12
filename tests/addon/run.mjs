// Loads the addon in TOC order inside a Lua engine with the stub, fires events,
// and runs the checks in checks.lua. Exits non-zero on any failure.
import { readFileSync } from "node:fs";
import fengari from "fengari";
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const dir = new URL("../../addon/ForeverGold/", import.meta.url);
const toc = readFileSync(new URL("ForeverGold.toc", dir), "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#"));
const data = process.argv[2] ? readFileSync(process.argv[2], "utf8") : "";

const L = lauxlib.luaL_newstate();
lualib.luaL_openlibs(L);
function run(src, name) {
  if (lauxlib.luaL_loadbuffer(L, to_luastring(src), null, to_luastring("@" + name)) !== 0 || lua.lua_pcall(L, 0, 0, 0) !== 0) {
    console.error(`FAILED in ${name}: ${to_jsstring(lua.lua_tostring(L, -1))}`);
    process.exit(1);
  }
}
const longString = (s) => {
  let eq = "=";
  while (s.includes(`]${eq}]`)) eq += "=";
  return `[${eq}[\n${s}]${eq}]`;
};
run(readFileSync(new URL("./wow-stub.lua", import.meta.url), "utf8"), "wow-stub.lua");
run("FG_NS = {}", "ns");
for (const file of toc) {
  // The data file comes from the server when given; otherwise the shipped placeholder.
  const src = file === "ForeverGold_Data.lua" && data ? data : readFileSync(new URL(file, dir), "utf8");
  run(`local f = assert(load(${longString(src)}, "@${file}")); f("ForeverGold", FG_NS)`, file);
}
run(readFileSync(new URL("./checks.lua", import.meta.url), "utf8"), "checks.lua");
if (process.env.SAVED_OUT) {
  lua.lua_getglobal(L, to_luastring("TEST_SAVED"));
  const { writeFileSync } = await import("node:fs");
  writeFileSync(process.env.SAVED_OUT, to_jsstring(lua.lua_tostring(L, -1)));
}
console.log("addon checks passed");
