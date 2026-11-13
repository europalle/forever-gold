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

async function get<T>(path: string, ifModifiedSince?: Date | null): Promise<ApiResult<T>> {
  const url = `${API}${path}${path.includes("?") ? "&" : "?"}namespace=${NS}&locale=${LOCALE}`;
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
