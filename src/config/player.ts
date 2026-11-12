// Who the advice is for. Edit here when skills or the market change.

export const MARKET = { region: "eu", ruleset: "pvp", faction: "alliance" } as const;

export const CHARACTERS = [
  {
    name: "Bubbi Hunter",
    role: "main",
    skills: { Skinning: 185, Leatherworking: 105, Cooking: 115, "First Aid": 30 },
  },
  {
    name: "Bubbi Banken",
    role: "bank alt",
    skills: { Tailoring: 63, Enchanting: 35 },
  },
] as const;

// Highest skill any of the characters has in a profession.
export function bestSkill(profession: string): number {
  let best = 0;
  for (const c of CHARACTERS) {
    const s = (c.skills as Record<string, number>)[profession];
    if (s !== undefined && s > best) best = s;
  }
  return best;
}
