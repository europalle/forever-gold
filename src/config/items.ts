// The items the dashboard tracks, and the conversions a leatherworker can make
// from them. Recipes are the Classic Era versions unless marked otherwise: Forever
// has not been checked for these yet (the addon will read the real ones from
// the profession window).

export type Group = "From your trades" | "Leather" | "Hides" | "Cured hides" | "Cloth" | "Enchanting" | "Reagents";

export type TrackedItem = { id: number; name: string; group: Group };

export const TRACKED: TrackedItem[] = [
  { id: 2318, name: "Light Leather", group: "Leather" },
  { id: 2319, name: "Medium Leather", group: "Leather" },
  { id: 4234, name: "Heavy Leather", group: "Leather" },
  { id: 4304, name: "Thick Leather", group: "Leather" },
  { id: 8170, name: "Rugged Leather", group: "Leather" },
  { id: 249427, name: "Pristine Leather", group: "Leather" },
  { id: 7287, name: "Red Whelp Scale", group: "Leather" },
  { id: 8154, name: "Scorpid Scale", group: "Leather" },

  { id: 783, name: "Light Hide", group: "Hides" },
  { id: 4232, name: "Medium Hide", group: "Hides" },
  { id: 4235, name: "Heavy Hide", group: "Hides" },
  { id: 8169, name: "Thick Hide", group: "Hides" },
  { id: 8171, name: "Rugged Hide", group: "Hides" },
  { id: 249428, name: "Pristine Hide", group: "Hides" },

  { id: 4231, name: "Cured Light Hide", group: "Cured hides" },
  { id: 4233, name: "Cured Medium Hide", group: "Cured hides" },
  { id: 4236, name: "Cured Heavy Hide", group: "Cured hides" },
  { id: 8172, name: "Cured Thick Hide", group: "Cured hides" },
  { id: 15407, name: "Cured Rugged Hide", group: "Cured hides" },

  { id: 2589, name: "Linen Cloth", group: "Cloth" },
  { id: 2592, name: "Wool Cloth", group: "Cloth" },
  { id: 4306, name: "Silk Cloth", group: "Cloth" },
  { id: 4338, name: "Mageweave Cloth", group: "Cloth" },

  { id: 10940, name: "Strange Dust", group: "Enchanting" },
  { id: 11083, name: "Soul Dust", group: "Enchanting" },
  { id: 11137, name: "Vision Dust", group: "Enchanting" },
  { id: 10938, name: "Lesser Magic Essence", group: "Enchanting" },
  { id: 10939, name: "Greater Magic Essence", group: "Enchanting" },
  { id: 10998, name: "Lesser Astral Essence", group: "Enchanting" },
  { id: 11082, name: "Greater Astral Essence", group: "Enchanting" },
  { id: 11134, name: "Lesser Mystic Essence", group: "Enchanting" },
  { id: 11135, name: "Greater Mystic Essence", group: "Enchanting" },
  { id: 11174, name: "Lesser Nether Essence", group: "Enchanting" },
  { id: 10978, name: "Small Glimmering Shard", group: "Enchanting" },
  { id: 11084, name: "Large Glimmering Shard", group: "Enchanting" },
  { id: 11138, name: "Small Glowing Shard", group: "Enchanting" },

  { id: 4289, name: "Salt", group: "Reagents" },
  { id: 8150, name: "Deeprock Salt", group: "Reagents" },
];

// "From your trades" is filled per user from their TSM ledger (src/lib/queries/board.ts).
export const GROUP_ORDER: Group[] = ["Hides", "Cured hides", "Leather", "Cloth", "Enchanting", "From your trades", "Reagents"];

// Make `output` from `from` plus bought `extras`. `from` is the item you have
// (the one the advice is about); extras are priced at their auction minimum.
export type Conversion = {
  verb: "Cure" | "Combine";
  from: { id: number; qty: number };
  extras: { id: number; qty: number }[];
  output: { id: number; qty: number };
  profession: "Leatherworking";
  skill: number;
  verified: boolean; // checked in Forever, not just Classic Era
  known?: boolean; // a character of this user has learned it (from the addon)
};

export const CONVERSIONS: Conversion[] = [
  { verb: "Cure", from: { id: 783, qty: 1 }, extras: [{ id: 4289, qty: 1 }], output: { id: 4231, qty: 1 }, profession: "Leatherworking", skill: 35, verified: false },
  { verb: "Cure", from: { id: 4232, qty: 1 }, extras: [{ id: 4289, qty: 1 }], output: { id: 4233, qty: 1 }, profession: "Leatherworking", skill: 100, verified: false },
  // Heavy Hide + 3 Salt is in Wowhead's Forever levelling guide (research 3.7).
  { verb: "Cure", from: { id: 4235, qty: 1 }, extras: [{ id: 4289, qty: 3 }], output: { id: 4236, qty: 1 }, profession: "Leatherworking", skill: 150, verified: true },
  { verb: "Cure", from: { id: 8169, qty: 1 }, extras: [{ id: 8150, qty: 1 }], output: { id: 8172, qty: 1 }, profession: "Leatherworking", skill: 200, verified: false },
  { verb: "Combine", from: { id: 2318, qty: 4 }, extras: [], output: { id: 2319, qty: 1 }, profession: "Leatherworking", skill: 100, verified: false },
  { verb: "Combine", from: { id: 2319, qty: 5 }, extras: [], output: { id: 4234, qty: 1 }, profession: "Leatherworking", skill: 150, verified: false },
];
