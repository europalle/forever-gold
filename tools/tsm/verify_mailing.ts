import { readFileSync } from "node:fs";
import { parseSavedVariables } from "../../src/lib/lua-table";
const prof = "BilisClassicForever(v1.0.1)";
const load = (f: string) => parseSavedVariables(readFileSync(f, "utf8")).TradeSkillMasterDB as any;
const before = load(process.argv[2]), after = load(process.argv[3]);
const g = after[`p@${prof}@userData@groups`];
const items = after[`p@${prof}@userData@items`];
const mails = (p: string) => Object.entries(g[p]?.Mailing ?? {}).filter(([k]) => /^\d+$/.test(k)).map(([, v]) => v);
const sendsFor = (itemPath: string) => mails(itemPath).length > 0;
let send = 0, keep = 0; const sentKinds = new Set<string>(), kept: string[] = [];
for (const [id, path] of Object.entries(items) as [string, string][]) {
  if (sendsFor(path)) { send++; sentKinds.add(path.split("`").slice(1, 5).join(" > ")); } else { keep++; }
}
console.log("items mailed:", send, "| items kept:", keep);
console.log("mailed groups (top 4 levels):", [...sentKinds].sort().slice(0, 30).join("\n  "));
for (const [name, id] of [["Light Leather", "i:2318"], ["Wool Cloth", "i:2592"], ["Soul Dust", "i:11083"], ["Heavy Shot (crafted)", "i:10513"], ["Rough Arrow", "i:2512"], ["Quiver", "i:5439"], ["Heavy Hide", "i:4235"]]) {
  const p = items[id]; console.log(`${name}: ${p ? (sendsFor(p) ? "MAILED" : "kept") : "not in profile"}  (${p?.split("`").slice(1).join(" > ")})`);
}
console.log("root:", JSON.stringify(g[prof].Mailing), "| ammo:", JSON.stringify(g[`${prof}\`Stackable\`Non-Crafted\`Ammo`].Mailing));
// Nothing but Mailing changed:
const strip = (d: any) => JSON.stringify(Object.fromEntries(Object.entries(d[`p@${prof}@userData@groups`]).map(([k, v]: any) => [k, { ...v, Mailing: undefined }])));
console.log("other group settings unchanged:", strip(before) === strip(after));
const rest = (d: any) => JSON.stringify({ ...d, [`p@${prof}@userData@groups`]: undefined });
console.log("rest of the file unchanged:", rest(before) === rest(after));
