// Blizzard's Game Data API for WoW Forever (undocumented; mapped in
// docs/research.md section 1): namespace dynamic-forever-eu, auction houses per
// ruleset, the same 15 house IDs under every ruleset, so data is keyed by house.

import type { RawAuction } from "./blizzard-depth";

// Overridable only so tests can point at a stand-in server.
const OAUTH = process.env.BNET_OAUTH_URL || "https://oauth.battle.net/token";
const API = process.env.BNET_API_BASE || "https://eu.api.blizzard.com";
const NS = "dynamic-forever-eu";
const LOCALE = "en_GB";
const TIMEOUT_MS = 60_000; // a listing is about 9 MB; a stuck request must not hold the whole run

export const blizzardConfigured = () => !!(process.env.BNET_CLIENT_ID && process.env.BNET_CLIENT_SECRET);

let token: { value: string; until: number } | null = null;

async function accessToken(): Promise<string> {
  if (token && token.until > Date.now() + 60_000) return token.value;
  const id = process.env.BNET_CLIENT_ID;
  const secret = process.env.BNET_CLIENT_SECRET;
  if (!id || !secret) throw new Error("BNET_CLIENT_ID and BNET_CLIENT_SECRET are not set");
  const res = await fetch(OAUTH, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Battle.net login refused (${res.status}): check the client ID and secret`);
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error("Battle.net login gave no token");
  token = { value: j.access_token, until: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return token.value;
}

export type ApiResult<T> = { status: number; data: T | null; lastModified: Date | null; bytes: number };

async function get<T>(path: string, ifModifiedSince?: Date | null, ns: string = NS): Promise<ApiResult<T>> {
  const url = `${API}${path}${path.includes("?") ? "&" : "?"}namespace=${ns}&locale=${LOCALE}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${await accessToken()}`, "Accept-Encoding": "gzip" };
  if (ifModifiedSince) headers["If-Modified-Since"] = ifModifiedSince.toUTCString();
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    const lm = res.headers.get("last-modified");
    const lastModified = lm ? new Date(lm) : null;
    if (res.status === 304) return { status: 304, data: null, lastModified, bytes: 0 };
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      const wait = Math.min(10, Number(res.headers.get("retry-after")) || 2 * (attempt + 1));
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) return { status: res.status, data: null, lastModified, bytes: 0 };
    const text = await res.text();
    return { status: res.status, data: JSON.parse(text) as T, lastModified, bytes: text.length };
  }
}

export type House = { id: number; name: string };

export async function rulesets(): Promise<{ id: number; name?: string }[]> {
  const r = await get<{ rulesets?: { id: number }[] }>("/data/wow/ruleset/index");
  const ids = (r.data?.rulesets ?? []).map((x) => x.id);
  const named = await Promise.all(ids.map(async (id) => ({ id, name: (await get<{ name?: string }>(`/data/wow/ruleset/${id}`)).data?.name })));
  return named;
}

export async function houses(rulesetId: number): Promise<House[]> {
  // The trailing slash is required (research 1.2).
  const r = await get<{ auctions?: { id: number; name: string }[] }>(`/data/wow/ruleset/${rulesetId}/auctions/`);
  if (!r.data) throw new Error(`Auction house list answered ${r.status}`);
  return (r.data.auctions ?? []).map((h) => ({ id: h.id, name: h.name }));
}

export async function commodities(rulesetId: number, houseId: number, ifModifiedSince?: Date | null) {
  const r = await get<{ auctions?: RawAuction[] }>(`/data/wow/ruleset/${rulesetId}/auctions/${houseId}/commodities`, ifModifiedSince);
  return { ...r, auctions: r.data?.auctions ?? [] };
}

export async function itemAuctions(rulesetId: number, houseId: number) {
  const r = await get<{ auctions?: RawAuction[] }>(`/data/wow/ruleset/${rulesetId}/auctions/${houseId}`);
  return { ...r, auctions: r.data?.auctions ?? [] };
}

// ---- Static game data: professions, recipes, item icons ----
// Forever's static namespace is not documented. Try the likely names once and
// keep the one that answers.
const STATIC_NAMESPACES = ["static-forever-eu", "static-classic-eu", NS];
let staticNs: string | null = null;

export async function staticGet<T>(path: string): Promise<ApiResult<T>> {
  if (staticNs) return get<T>(path, null, staticNs);
  let last: ApiResult<T> | null = null;
  for (const ns of STATIC_NAMESPACES) {
    last = await get<T>(path, null, ns);
    if (last.status === 200) {
      staticNs = ns;
      return last;
    }
  }
  return last!;
}
export const staticNamespace = () => staticNs;

type Ref = { id?: number; name?: string };

export async function professionIndex(): Promise<{ status: number; professions: { id: number; name: string }[] }> {
  const r = await staticGet<{ professions?: Ref[] }>("/data/wow/profession/index");
  return { status: r.status, professions: (r.data?.professions ?? []).filter((p): p is { id: number; name: string } => typeof p.id === "number" && typeof p.name === "string") };
}

export async function professionTiers(id: number): Promise<{ id: number; name: string }[]> {
  const r = await staticGet<{ skill_tiers?: Ref[] }>(`/data/wow/profession/${id}`);
  return (r.data?.skill_tiers ?? []).filter((t): t is { id: number; name: string } => typeof t.id === "number").map((t) => ({ id: t.id, name: t.name ?? "" }));
}

export async function tierRecipes(professionId: number, tierId: number): Promise<{ id: number; name: string; category: string }[]> {
  const r = await staticGet<{ categories?: { name?: string; recipes?: Ref[] }[] }>(`/data/wow/profession/${professionId}/skill-tier/${tierId}`);
  const out: { id: number; name: string; category: string }[] = [];
  for (const c of r.data?.categories ?? []) {
    for (const x of c.recipes ?? []) if (typeof x.id === "number") out.push({ id: x.id, name: x.name ?? "", category: c.name ?? "" });
  }
  return out;
}

export type RecipeDetail = { status: number; name: string | null; outputId: number | null; outputQty: number; reagents: [number, number][] };

// Parses a recipe answer, tolerant of the shapes Blizzard uses across game versions.
export function parseRecipe(status: number, d: unknown): RecipeDetail {
  const o = (d ?? {}) as {
    name?: string;
    crafted_item?: Ref;
    alliance_crafted_item?: Ref;
    crafted_quantity?: { value?: number; minimum?: number; maximum?: number };
    reagents?: { reagent?: Ref; quantity?: number }[];
  };
  const q = o.crafted_quantity;
  const qty = typeof q?.value === "number" ? q.value : typeof q?.minimum === "number" && typeof q?.maximum === "number" ? (q.minimum + q.maximum) / 2 : 1;
  const reagents: [number, number][] = [];
  for (const r of o.reagents ?? []) if (typeof r.reagent?.id === "number") reagents.push([r.reagent.id, Math.max(1, r.quantity ?? 1)]);
  return { status, name: o.name ?? null, outputId: o.crafted_item?.id ?? o.alliance_crafted_item?.id ?? null, outputQty: qty > 0 ? qty : 1, reagents };
}

export async function recipeDetail(id: number): Promise<RecipeDetail> {
  const r = await staticGet<unknown>(`/data/wow/recipe/${id}`);
  return parseRecipe(r.status, r.data);
}

// The icon image of an item, or null when Blizzard has none.
export async function itemIcon(id: number): Promise<{ status: number; url: string | null }> {
  const r = await staticGet<{ assets?: { key?: string; value?: string }[] }>(`/data/wow/media/item/${id}`);
  const a = (r.data?.assets ?? []).find((x) => x.key === "icon") ?? r.data?.assets?.[0];
  const url = a?.value && /^https:\/\/render[\w.-]*\.worldofwarcraft\.com\//.test(a.value) ? a.value : null;
  return { status: r.status, url };
}
