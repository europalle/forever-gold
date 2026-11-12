// Adds a "Forever Gold" group to the BilisClassicForever profile and moves the
// leather, hides, cloth and enchanting materials into it, with operations that
// price from this auction house only (no EU-wide averages).
//
//   npx tsx tools/tsm/forever_group.ts TradeSkillMaster.lua ForeverGold.lua OUT.lua
//
// Items are chosen by type from the Forever Gold addon's saved file (trade goods,
// subclass Leather 6, Cloth 5, Enchanting 12). Everything else in the profile is
// left as it is. Refuses to write if the file does not look as expected.

import { readFileSync, writeFileSync } from "node:fs";
import { parseSavedVariables } from "../../src/lib/lua-table";

const PROFILE = "BilisClassicForever(v1.0.1)";
const TOP = "Forever Gold";
const SUBGROUPS: [number, string][] = [
  [6, "Leather and hides"],
  [5, "Cloth"],
  [12, "Enchanting"],
];
const POST = "FG Post";
const BUY = "FG Buy Dips";

const [tsmPath, fgPath, outPath] = process.argv.slice(2);
if (!tsmPath || !fgPath || !outPath) {
  console.error("usage: npx tsx tools/tsm/forever_group.ts TradeSkillMaster.lua ForeverGold.lua OUT.lua");
  process.exit(2);
}
const abort = (msg: string): never => {
  console.error(`ABORT: ${msg} Nothing written.`);
  process.exit(1);
};

// ---- choose the items ----
const fg = parseSavedVariables(readFileSync(fgPath, "utf8")).ForeverGoldDB as Record<string, Record<string, Record<string, unknown>>>;
if (!fg?.items) abort("no item details in the Forever Gold file.");
const chosen = new Map<number, string>(); // item id -> subgroup
for (const [id, info] of Object.entries(fg.items)) {
  if (info.c !== 7) continue;
  const sub = SUBGROUPS.find(([s]) => s === info.s);
  if (sub) chosen.set(Number(id), sub[1]);
}
if (chosen.size < 20) abort(`only ${chosen.size} items found; expected the addon to have looked up more.`);

// ---- edit the TSM file line by line ----
const raw = readFileSync(tsmPath);
const text = raw.toString("utf8");
const nl = text.includes("\r\n") ? "\r\n" : "\n";
const lines = text.split(nl);
if (lines.some((l) => l.includes(`\`${TOP}\``) || l === `["${TOP}"] = {`)) abort(`a "${TOP}" group already exists: run this on a file without it.`);

const findOnce = (line: string) => {
  const at = lines.flatMap((l, i) => (l === line ? [i] : []));
  if (at.length !== 1) abort(`${line} found ${at.length} times, expected once.`);
  return at[0];
};
// The end of the table that opens at line i (lines are one entry each).
const closeOf = (i: number) => {
  let depth = 0;
  for (let j = i; j < lines.length; j++) {
    const l = lines[j];
    if (l.endsWith("{")) depth++;
    if (l === "}," || l === "}") depth--;
    if (depth === 0) return j;
  }
  return abort(`table at line ${i + 1} never closes.`);
};

const itemsAt = findOnce(`["p@${PROFILE}@userData@items"] = {`);
const groupsAt = findOnce(`["p@${PROFILE}@userData@groups"] = {`);
const opsAt = findOnce(`["p@${PROFILE}@userData@operations"] = {`);

// Inside operations: the Auctioning and Shopping tables at depth one.
const opTable = (name: string) => {
  const end = closeOf(opsAt);
  for (let j = opsAt + 1; j < end; j++) {
    if (lines[j] === `["${name}"] = {`) return j;
    if (lines[j].endsWith("{")) j = closeOf(j);
  }
  return abort(`no ${name} operations.`);
};

const groupBlock = (path: string, mail: boolean, top: boolean) => [
  `["${path}"] = {`,
  `["Shopping"] = {`, `"${BUY}",`, `["override"] = true,`, `},`,
  `["Warehousing"] = {`, `},`,
  `["Auctioning"] = {`, `"${POST}",`, `["override"] = true,`, `},`,
  `["Crafting"] = {`, `"Crafting",`, ...(top ? [`["override"] = true,`] : []), `},`,
  `["Mailing"] = {`, ...(mail ? [`"Default Mail",`] : []), `["override"] = true,`, `},`,
  `["Vendoring"] = {`, `"Vendoring",`, ...(top ? [`["override"] = true,`] : []), `},`,
  `["Sniper"] = {`, `"Stackable",`, ...(top ? [`["override"] = true,`] : []), `},`,
  `},`,
];

// Prices from this auction house only: dbmarket and dbhistorical are TSM's
// realm values. Never under 85% of the lower of the two, nor under vendor price.
const postOp = [
  `["${POST}"] = {`,
  `["cancelRepost"] = true,`,
  `["normalPrice"] = "110% dbmarket",`,
  `["cancelUndercut"] = true,`,
  `["keepQuantity"] = "0",`,
  `["postCap"] = "200",`,
  `["bidPercent"] = 1,`,
  `["relationships"] = {`, `},`,
  `["maxPrice"] = "200% dbmarket",`,
  `["ignoreLowDuration"] = 0,`,
  `["ignoreFactionrealm"] = {`, `},`,
  `["undercut"] = "1c",`,
  `["maxExpires"] = "0",`,
  `["priceReset"] = "none",`,
  `["aboveMax"] = "maxPrice",`,
  `["duration"] = 2,`,
  `["minPrice"] = "max(110% first(vendorsell, 0), 85% min(dbmarket, first(dbhistorical, dbmarket)))",`,
  `["ignorePlayer"] = {`, `},`,
  `["cancelRepostThreshold"] = "10s",`,
  `},`,
];
const buyOp = [
  `["${BUY}"] = {`,
  `["ignoreFactionrealm"] = {`, `},`,
  `["relationships"] = {`, `},`,
  `["maxPrice"] = "70% min(dbmarket, first(dbhistorical, dbmarket))",`,
  `["restockQuantity"] = "min(first(bilisrestockqty, 0), 50000)",`,
  `["ignorePlayer"] = {`, `},`,
  `["restockSources"] = {`, `["alts"] = true,`, `["auctions"] = true,`, `["guild"] = true,`, `["bank"] = true,`, `},`,
  `["showAboveMaxPrice"] = false,`,
  `},`,
];

// Item lines: move the chosen ones, add those the profile did not have.
const itemsEnd = closeOf(itemsAt);
const itemRe = /^\["i:(\d+)"\] = "(.*)",$/;
let moved = 0;
const seen = new Set<number>();
for (let j = itemsAt + 1; j < itemsEnd; j++) {
  const m = itemRe.exec(lines[j]);
  if (!m) continue;
  const id = Number(m[1]);
  const sub = chosen.get(id);
  if (!sub) continue;
  lines[j] = `["i:${id}"] = "${TOP}\`${sub}",`;
  seen.add(id);
  moved++;
}
const added = [...chosen.entries()].filter(([id]) => !seen.has(id)).map(([id, sub]) => `["i:${id}"] = "${TOP}\`${sub}",`);

// Insert from the bottom of the file up, so earlier line numbers stay right.
const inserts: [number, string[]][] = [
  [closeOf(opTable("Shopping")), buyOp],
  [closeOf(opTable("Auctioning")), postOp],
  [closeOf(groupsAt), [groupBlock(TOP, false, true), ...SUBGROUPS.map(([, sub]) => groupBlock(`${TOP}\`${sub}`, true, false))].flat()],
  [itemsEnd, added],
];
inserts.sort((a, b) => b[0] - a[0]);
for (const [at, block] of inserts) lines.splice(at, 0, ...block);

writeFileSync(outPath, lines.join(nl));

// Check the result parses and says what we meant.
const out = parseSavedVariables(readFileSync(outPath, "utf8")).TradeSkillMasterDB as Record<string, Record<string, unknown>>;
const items = out[`p@${PROFILE}@userData@items`] as Record<string, string>;
const groups = out[`p@${PROFILE}@userData@groups`] as Record<string, unknown>;
const ops = out[`p@${PROFILE}@userData@operations`] as Record<string, Record<string, unknown>>;
const inGroup = Object.values(items).filter((g) => g.startsWith(TOP)).length;
if (inGroup !== chosen.size || !groups[TOP] || !ops.Auctioning[POST] || !ops.Shopping[BUY]) abort("the written file does not check out.");
const per = SUBGROUPS.map(([, sub]) => `${sub} ${Object.values(items).filter((g) => g === `${TOP}\`${sub}`).length}`).join(", ");
console.log(`Wrote ${outPath}: ${chosen.size} items in "${TOP}" (${per}); ${moved} moved from Bilis groups, ${added.length} added. ${Object.keys(items).length} items in the profile.`);
