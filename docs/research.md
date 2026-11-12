# WoW Forever gold tool: build reference

Nov 12, 2026 · @Bubbi

## Summary

You can start building the collector, the addon and the price feed today. The data plumbing is solid; the game rules your profit maths depends on are not. The bank-alt plan carries the biggest risk: two guides say a level 1 character cannot train a crafting profession at all (it may need level 5), and the claim that Disenchant has no skill gate rests on one beta-based site. Ten minutes in game (T4.1 and T4.2) settles both.

Your setup line still has the template placeholders (region, ruleset, faction, level). EU is used for examples throughout; IDs are given for all regions.

### Solid enough to build on

- **Server collector** (Section 1). Namespace `dynamic-forever-eu`; routes `/data/wow/ruleset/{id}/auctions/` (trailing slash required), `.../auctions/{houseId}` and `.../commodities`; client-credentials OAuth; about 31 requests per region per hour, far under the limits. Payload schema and samples are recorded from live responses. Recipes with reagents come from `/data/wow/recipe/{id}`. 43% of auctioned item IDs 404 on the Forever item route, so fall back to retail static data and ForeverDB for names.
- **Addon** (Section 5). Interface 16001, `_Forever.toc`, folder `_forever_`, `C_AuctionHouse` with `ReplicateItems` on a 15-minute account-wide cooldown, `C_TradeSkillUI` (data only after the profession window opens), `C_Container`, legacy mail globals with `GetInboxInvoiceInfo` for sales. SavedVariables are written only at logout and `/reload`.
- **The automation line** (5.6). It is enforced in code: post, bid, buy and cancel are restricted functions that need a real click. An advise-only addon is well inside it. The written policy is silent on companion desktop apps; TSM and AHledger both run one openly on Forever. Never send input to the game or read its memory.
- **External prices** (Section 6). AHledger's API covers EU markets, is free for personal use with a credit line, and tightens on 2026-12-10 (30 requests per minute keyless, no keeping data past cache time).
- **Economy rules with primary sources** (Section 2). The 1 copper minimum deposit was pulled and goes live with weekly maintenance on 2026-11-17 (US wording; EU unchecked). Until then the floor is 1 silver. The Temporary Economy Hold targets suspected gold buying and selling and restricts trade, mail, guild bank and the AH. Stackables trade retail-style as commodities, bought by quantity, cheapest first.
- **Profession hotfixes** (Sections 3 and 4). Tanning Rack needs Leatherworking 125; five bags gained slots on 11 Nov; Arcane Salvager now needs the Runed Golden Rod and its bonus applies to lower-level enchanters.

### Open questions, ranked by how much they block the build

| Rank | Question | Why it blocks | Settle with |
| --- | --- | --- | --- |
| 1 | Can a level 1 character train Enchanting and Tailoring? Level 5 (Warcraft Tavern, Method.gg) or none (WoW-Professions) | If level 5, the bank alt cannot disenchant until it levels | T4.1 |
| 2 | Does Disenchant have a skill gate by item level? | Decides which items a skill-1 alt can disenchant at all | T4.2 |
| 3 | Which house ID is your ruleset and faction? The API returns the same 15 houses on every ruleset; Blizzard said rulesets have separate houses. EU's ID-to-faction map is unrecorded | Your price data has to be keyed to the right market | T1.6, T1.3 |
| 4 | Deposit formula, duration multipliers and the AH cut (5% and 15% are beta-guide figures only) | Every profit calculation uses them | T2.1, T2.2; log `deposit` and `consignment` from sale mails |
| 5 | Is an item auction's `buyout` per stack or per unit? | Wrong per-unit prices for non-commodity stacks | T1.5 |
| 6 | API snapshot refresh interval, If-Modified-Since and gzip | Sets the collector's schedule and bandwidth | T1.7, T1.4 |
| 7 | Forever-verified disenchant odds and brackets (one beta-era table, keyed on Requires Level) | Disenchant value estimates | T4.3 to T4.5 |
| 8 | Reagents for about 440 Leatherworking recipes, workstation gating, cooldowns | Craft-cost coverage; the API's Leatherworking skill tier (592 recipes) should fill most of it | T3.1, T3.3, or the API route in 1.7 |
| 9 | Pristine and Fel material sources and drop rates; Merchant's Favor per crate; what Craftsman's Writs ask | Skinning and crate advice | T3.5, T3.6 |
| 10 | TSM 4.15 on Forever: version, price source names, AppData and Accounting formats | Only matters if you read TSM's files; your own addon and AHledger cover the same needs | T6.1 to T6.4 |

Two conflicts the sections resolve: auctionhouse.fyi says Forever has no auction API, but four independent sources show it works; and the ForeverPlusPlus doc you pointed to covers only the in-game Lua API, not the Web API.

## 1. Blizzard Game Data API for Forever

The Forever auction API works today and an hourly collector can be built on it: 31 requests per region per run, under `dynamic-forever-{region}`, keyed by ruleset and auction house. Blizzard has published no documentation, changelog or blue post for it (checked 2026-11-12). Everything below comes from community probing, two independent client libraries and live responses one of them recorded. The biggest open issue: every ruleset returns the same 15 houses with identical auctions, which contradicts Blizzard's statement that rulesets have separate auction houses.

Main sources (cited by letter below):

- **\[T\]** Blizzard API forum thread ["WoW: Forever API: what works so far, plus a TS client"](https://us.forums.blizzard.com/en/blizzard/t/wow-forever-api-what-works-so-far-plus-a-ts-client/60334), 2026-11-05 with an update on 2026-11-06. No staff replies.
- **\[P\]** [Pinta365/blizzard\_api](https://github.com/Pinta365/blizzard_api), TypeScript, v0.8.5 (2026-11-10), docs "last checked 2026-11-09". This is the client the thread announces, so \[T\] and \[P\] are probably the same author and do not count as independent.
- **\[S\]** [SideQuest-Guild/wow-forever-sdk](https://github.com/SideQuest-Guild/wow-forever-sdk), Python, v0.5.1 (2026-11-11), with live US responses and headers recorded 2026-11-10 and 11 in `tests/fixtures/`. Independent of \[T\] and \[P\].
- **\[M\]** [mhuijskens.com WoW Forever API notes](https://mhuijskens.com/WoWForever/Api/), checked 2026-11-05 09:15 UTC. Independent.
- The starting point you named, [ForeverPlusPlus docs/forever-api.md](https://github.com/xIGBClutchIx/ForeverPlusPlus/blob/main/docs/forever-api.md), covers only the in-game Lua API. The whole repo was cloned and searched: it has no Web API content. It gives client facts only (build, product `wowf`, codename Camelot).

### 1.1 Namespaces and hosts

| Namespace | Use | Tag | Sources |
| --- | --- | --- | --- |
| `dynamic-forever-{region}` | rulesets, auction houses, region | CONFIRMED | \[T\]; \[S\] response header `battlenet-namespace: dynamic-forever-us`; \[M\] |
| `static-forever-{region}` | items, recipes, professions; an alias for the current static version | CONFIRMED | \[T\]; \[P\] (works in all regions including KR since 2026-11-04 17:34); \[S\]; \[M\] |
| `static-1.60.1_70399-forever-{region}` | the pinned version behind the alias; responses to `static-forever-us` carry it in `battlenet-namespace` and self links | CONFIRMED | \[S\] e.g. `tests/fixtures/static/recipe/2427.json`; \[M\]; \[P\] |
| `profile-forever-{region}` | characters, guilds, account | CONFIRMED | \[T\]; \[P\]; \[M\] |
| Versioned static for builds 70707, 70755, 70790 | 403; only 70399 exists | REPORTED | \[M\] |
| Pre-launch guesses (`dynamic-forever` without region, `dynamic-classicplus`, `dynamic-classicforever`, `dynamic-classic2x` to `5x`) | 403 "unknown namespace" | REPORTED, beta-era | [goldbook issue #67](https://github.com/jkc-be/goldbook/issues/67), 2026-10-28 |

- Regions us, eu, kr and tw work with ordinary credentials (CONFIRMED: \[T\]; \[P\] verified all four on 2026-11-06; \[S\]). CN refuses them and needs a China-registered client at `gateway.battlenet.com.cn` with OAuth at `oauth.battlenet.com.cn` (REPORTED, \[P\]).
- Host `https://{region}.api.blizzard.com` (CONFIRMED). Media: `https://render.worldofwarcraft.com/forever-{region}/...`, e.g. `.../forever-us/icons/56/135349.jpg` (CONFIRMED, \[S\] and \[T\]).
- Locale: both SDKs always send one; \[P\] defaults to en\_US, en\_GB, ko\_KR, zh\_TW. Search returns names in 12 locales (REPORTED).
- Status codes: 403 means the namespace does not exist on a valid route; 404 means a valid namespace with nothing at that path (REPORTED, \[M\]).
- The static API version (70399) lags the client build (70888 since 2026-11-11). Do not build the namespace from the client build; read it from `battlenet-namespace` or `_links.self.href`.

### 1.2 Routes and rulesets

Forever has no realms in the API. A ruleset (PvP, Normal, Roleplay, Roleplay PvP) takes the realm's place. All routes use `namespace=dynamic-forever-{region}`.

| Route | Returns | Tag |
| --- | --- | --- |
| `GET /data/wow/ruleset/index` | `{ _links, rulesets: [{ id, key{href} }] }` | CONFIRMED (\[T\], \[P\], \[S\]) |
| `GET /data/wow/ruleset/{id}` | `{ id, name, status{type,name}, auctions{href} }`, e.g. `{"id":1,"name":"PvP","status":{"name":"Up","type":"UP"}}` | CONFIRMED (\[P\], \[S\]) |
| `GET /data/wow/ruleset/{id}/auctions/` (trailing slash required) | house index `{ auctions: [{ id, name, key{href} }] }` | CONFIRMED (\[T\], \[P\], \[S\]) |
| `GET /data/wow/ruleset/{id}/auctions/{houseId}` | `{ id, name, auctions?[], commodities{href}, ruleset{href} }` | CONFIRMED (\[T\], \[P\], \[S\]) |
| `GET /data/wow/ruleset/{id}/auctions/{houseId}/commodities` | `{ _links, auctions?[] }` | CONFIRMED (\[T\], \[P\], \[S\]) |
| `GET /data/wow/region/index`, `/data/wow/region/91` | region 91 "CAMWOW North America", `patch_string` 1.60.1, tag US | REPORTED (\[S\]) |

Routes that do not work after launch:

| Route | Result | Tag |
| --- | --- | --- |
| `/data/wow/realm/index` and `/data/wow/realm/*` | 404 since the namespace was republished at 18:47 GMT on 2026-11-04 | CONFIRMED (\[T\], \[P\], \[M\]) |
| `/data/wow/search/realm` | 200 with 0 results | CONFIRMED (\[T\], \[S\]) |
| `/data/wow/connected-realm/*` | 404 | CONFIRMED (\[P\], \[M\]) |
| `/data/wow/auctions/commodities` (retail region-wide) | 404 | CONFIRMED (\[T\], \[P\], \[M\]) |
| `/data/wow/ruleset/{id}/auctions` without the slash | 404 since 2026-11-06; the reverse was true before | REPORTED (\[T\]) |
| `/data/wow/ruleset/999` | 404 | REPORTED (\[T\]) |
| WoW Token, PvP seasons, Mythic+ seasons | 404 | CONFIRMED (\[P\], \[M\]) |

Rulesets:

| ID | Name | Regions | Tag |
| --- | --- | --- | --- |
| 1 | PvP | us, eu, kr, tw | CONFIRMED (\[P\], \[M\], \[S\]) |
| 2 | Normal | us, eu, kr, tw | CONFIRMED (\[P\], \[M\]) |
| 3 | Roleplay | us, eu | CONFIRMED (\[P\], \[M\]) |
| 15 | Roleplay PvP | us, eu | CONFIRMED (\[P\], \[M\], \[S\]) |

**The ruleset ID filters nothing.** Every ruleset in a region lists the same 15 houses with identical auctions; house 113 returned the same \~68k auction IDs through rulesets 1, 2 and 3 (CONFIRMED: \[T\] 2026-11-06, \[P\], \[S\], \[M\]). The house's `ruleset` link just echoes the ruleset you asked through. This conflicts with Blizzard's pre-launch statement, known only through secondhand write-ups ([GamerFuzion](https://www.gamerfuzion.com/world-of-warcraft-forever-rule-sets-separate-layering-realmless-world-refresh/), 2026-11-01, citing PCGamesN), that each ruleset has its own auction houses, which could be linked as a last resort. Until T1.6 settles it, fetch each house once per region (through ruleset 2) and key data by region and house ID, not by ruleset and house ID. Never sum totals across rulesets.

Beta-era, superseded: \[S\] still ships realm models from transcribed pre-launch data ("CAMWOW US1 Realm 1 PvE" id 6794 and others). The in-game client reportedly spans several GUID realm IDs per ruleset (4618/4620 PvE, 4613/4619 PvP; ForeverPlusPlus, 2026-10-23).

### 1.3 Auction house IDs and factions

Fifteen IDs, 110-121 and 123-125 (no 122), five each named Alliance, Horde and Blackwater (neutral). The same 15 IDs exist in every region (CONFIRMED: \[T\], \[P\], \[M\]). Per-ID names below come from \[S\]'s recorded US index (Last-Modified 2026-11-11 01:22:32 GMT); \[M\] agrees independently on the blocks. CONFIRMED for US.

| Faction | House IDs (US) | Empty (no `auctions` key) |
| --- | --- | --- |
| Alliance | 110, 111, 112, 119, 123 | 112 |
| Horde | 113, 114, 115, 120, 124 | 115 |
| Blackwater (neutral) | 116, 117, 118, 121, 125 | 118 |

- House 113 (Horde) held about 68k auctions on 2026-11-06 (\[T\]). House 125's recorded sample has 284 item auctions and 962 commodity rows (possibly trimmed).
- EU, KR and TW: nobody has recorded the ID-to-name map. "Five each" is REPORTED for all regions; the per-ID faction outside US is UNVERIFIED (T1.3).
- What each of the five houses per faction represents, and how in-game auctioneers map to IDs, is undocumented (\[P\] lists it as an open question, 2026-11-09). Five per faction does not match four rulesets, so do not assume one house per ruleset. Read `name` from the index on every run rather than hard-coding the map.

### 1.4 Auction payload schema

Retail shape. Item auctions carry `buyout` and/or `bid`; commodities come from a separate per-house route with a per-unit `unit_price`. There is no seller field (REPORTED, \[P\]). CONFIRMED by \[T\], \[P\] types and \[S\] models and fixtures unless noted.

House response:

| Field | Type | Notes |
| --- | --- | --- |
| `_links.self.href` | string |  |
| `id` | int | house ID |
| `name` | string | e.g. "Blackwater Auction House" |
| `auctions` | array, optional | absent when the house is empty |
| `commodities.href` | string |  |
| `ruleset.href` | string | echoes the requested ruleset |

Item auction entry:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | int | auction ID |
| `item.id` | int |  |
| `item.context` | int, optional |  |
| `item.bonus_lists` | int array, optional | e.g. \[12721\] |
| `item.modifiers` | array of {type, value}, optional |  |
| `buyout` | int copper, optional | absent on bid-only auctions (1 of 284 in \[S\]'s sample) |
| `bid` | int copper, optional |  |
| `quantity` | int |  |
| `time_left` | enum | SHORT, MEDIUM, LONG, VERY\_LONG |

Commodity entry: `id`, `item.id` (no context, bonus lists or modifiers), `quantity`, `unit_price` (copper per unit), `time_left`. No `bid` or `buyout`.

Sample, recorded by \[S\]: US, house 125 Blackwater (neutral) through ruleset 2, Last-Modified 2026-11-11 01:22:32 GMT. US prices, examples only:

```json
{"buyout":4000,"id":32809454,"item":{"bonus_lists":[12721],"id":4575},"quantity":1,"time_left":"LONG"}
{"id":33358838,"item":{"id":4603},"quantity":5,"time_left":"LONG","unit_price":210}
```

Whether an item auction's `buyout` is per stack or per unit is not established: \[T\] leaves it open and every item auction in \[S\]'s sample has quantity 1. Retail baseline, not confirmed for Forever: `buyout` is the auction total. Store raw `buyout`, `bid` and `quantity`, and derive per-unit prices only after T1.5.

### 1.5 Refresh, change detection and size

- REPORTED (\[S\] recorded headers only): auction index, house and commodity responses carry `last-modified` (e.g. "Wed, 11 Nov 2026 01:22:32 GMT") and `cache-control: public, max-age=86400`. Ruleset index and detail carry `max-age=30`.
- The real refresh interval has not been measured by anyone (\[M\], 2026-11-05; nothing since). The 86400 max-age is probably a generic header: do not let an HTTP cache honour it.
- In \[S\]'s recordings, Last-Modified values land on hh:22:32 (static 2026-11-10 15:22:32, auctions 2026-11-11 01:22:32). That may point to a publish job at :22 or be coincidence (UNVERIFIED, T1.7).
- ETag: none in \[S\]'s recorded headers, which may be a subset (UNVERIFIED). If-Modified-Since and 304: untested (UNVERIFIED; retail honours it). gzip: nobody mentions it (UNVERIFIED). T1.4 checks all three.
- Size: the busiest houses hold 50,000-70,000 auctions, about 9 MB per response (REPORTED, \[T\] 2026-11-06 and \[P\] 2026-11-09, same author). \[M\] counted 31,689 listings and 19,937 commodity rows in the EU Normal Horde house the morning after launch.
- auctionhouse.fyi's "hourly snapshots" describe its own player scans, not the API's cadence.

Collector design: poll hourly with `If-Modified-Since` set to the last `Last-Modified`, key each snapshot by its `Last-Modified`, and treat a missing `auctions` key as an empty house.

### 1.6 OAuth and rate limits

- Client-credentials token from `https://oauth.battle.net/token` (shared by US, EU, KR, TW), sent as a Bearer header (CONFIRMED: \[S\] `src/wow/_base.py`, \[P\] `src/shared/context.ts`). Only account-profile routes need a user token.
- Token lifetime: both SDKs read `expires_in` and renew early; no Forever value recorded. Retail baseline about 24 hours.
- Limits: 36,000 requests per hour per client and 100 per second (REPORTED: a 2020 forum post, [API Access - Clients - Rate Limits](https://us.forums.blizzard.com/en/blizzard/t/api-access-clients-rate-limits/5602), plus goldbook #67). These are general Battle.net limits; nothing Forever-specific was reported, and develop.battle.net could not be fetched.
- An hourly run is about 31 requests per region (1 index, 15 houses, 15 commodity routes), far below the limit. \[S\] retries 408, 429 and 5xx and honours `Retry-After` up to 60 seconds, a sensible pattern to copy.

### 1.7 Item, recipe and profession endpoints

All answer in `static-forever-{region}`, but item data is incomplete.

| Endpoint | Result | Tested by, date | Tag |
| --- | --- | --- | --- |
| `/data/wow/item/{id}` | 200 for many; 404 for 652 of 1,515 distinct auctioned IDs (43%) in one EU Alliance house, e.g. 720 | \[T\] 2026-11-06; \[P\] 2026-11-09; \[M\] | CONFIRMED works; 43% REPORTED |
| `/data/wow/media/item/{id}` | 200, e.g. 19019 | \[S\] 2026-11-10; \[M\] | CONFIRMED |
| `/data/wow/item-class/index`, `/item-class/{id}` | 200 (0 Consumable, 1 Container, 2 Weapon, 4 Armor, 5 Reagent, 6 Projectile, 7 Trade Goods, ...) | \[S\] 2026-11-10; \[M\] | CONFIRMED |
| `/data/wow/item-class/{c}/item-subclass/{s}` | in \[P\]'s weekly drift test | \[P\] | REPORTED |
| `/data/wow/item-set/index` | 200, 154 sets | \[M\] | REPORTED |
| `/data/wow/search/item?name.en_US=...` | 200 (Thunderfury is id 289294); capped at 1,000 results | \[S\]; \[M\] | CONFIRMED works; cap REPORTED |
| `/data/wow/profession/index` | 200: 12 professions plus "Test Profession \[DNT\]" | \[M\]; \[S\] | CONFIRMED |
| `/data/wow/profession/{id}/skill-tier/{tier}` | 200; one tier per profession with all its recipes. Leatherworking (164, tier 2938) has 592 recipes in 25 categories | \[M\]; \[S\] | CONFIRMED works; counts REPORTED |
| `/data/wow/recipe/{id}` | 200 with `crafted_item`, `crafted_quantity{minimum,maximum}`, `reagents[{quantity, reagent{id,name}}]`; no `rank` | \[S\] 2026-11-10 (2427); \[P\] (10604) | CONFIRMED |
| `/data/wow/media/recipe/{id}`, `/media/profession/{id}` | 200 | \[S\] | REPORTED |
| `/data/wow/spell/133`, `/data/wow/creature/448` | 404 (IDs not in Forever) | \[M\] | REPORTED |
| heirloom, journal-expansion, journal-instance, journal-encounter, pet-ability indexes | empty | \[P\] 2026-11-09 | REPORTED |

Recipe sample (US, recorded 2026-11-10, trimmed):

```json
{"id":2427,"name":"Coarse Dynamite","crafted_item":{"id":4365,"name":"Coarse Dynamite"},
 "crafted_quantity":{"minimum":1.0,"maximum":4.0},
 "reagents":[{"quantity":3,"reagent":{"id":4364,"name":"Coarse Blasting Powder"}},
             {"quantity":1,"reagent":{"id":2589,"name":"Linen Cloth"}}]}
```

This matters for Section 3: the Leatherworking skill tier (592 recipes) plus `/recipe/{id}` should fill the reagent gaps in the recipe table directly from Blizzard. Most items that 404 on Forever exist in retail static data (`namespace=static-{region}`), usable for names, quality and class, though retail stats may differ (REPORTED, \[P\]).

### 1.8 Alternative item and recipe sources

| Source | Coverage and freshness | Machine access | Licence | Tag |
| --- | --- | --- | --- | --- |
| [foreverdb.net](https://foreverdb.net/) | Extracted from the game client; build 1.60.1.70888 (2026-11-11); 23,634 items, 32,121 spells, profession recipes | Documented API at /developers (Section 6.7): approval, 60/min, 10,000/day | Credit link, no resale (Section 6.7) | REPORTED |
| wago.tools DB2 | Forever builds under 1.60.1.x (70009, 70205, 70790, 70862), e.g. `wago.tools/db2/GlobalColor?build=1.60.1.70009` | DB2 browser and CSV export (not fetched: blocked) | not checked | REPORTED via ForeverPlusPlus |
| Wowhead Forever | A /forever/ section exists | Tooltip, XML and JSON endpoints UNVERIFIED (pages came back empty) | not checked | UNVERIFIED |
| [WarcraftDB Forever](https://forever.warcraftdb.com/) | Fed by the Lexicon in-game data client | not checked | not checked | REPORTED (Warcraft Tavern, 2026-11-05) |
| Retail Game Data API | Names, quality, class for most Forever 404 items | Official API | Blizzard API terms | REPORTED (\[P\]) |

- wago.tools product key for Forever: not confirmed. The client product is `wowf`, but wago's build list could not be fetched.
- DB2 table names (ItemSparse, SpellReagents, SkillLineAbility): retail-client baseline, likely since Forever runs the modern client, not confirmed.
- Recommended stack: Blizzard recipe and skill-tier routes for recipes and reagents; Forever item route, then retail item route, then ForeverDB, for names and vendor prices.

### 1.9 Conflicts

1. **Separate houses per ruleset** (Blizzard design statement, secondhand) versus identical houses on every ruleset (four API sources). Also conflicts with Section 2's "market per ruleset and faction" (timesaver.gg) and AHledger's 24 markets keyed by ruleset (Section 6). Settle with T1.6 plus an in-game cross-check: post a unique item on a known ruleset and find which house ID it appears in.
2. **When auctions went live:** \[M\] counted listings on 2026-11-05 while \[T\] and \[P\] date auction data from 2026-11-06, when the trailing-slash rule also flipped. No longer matters; T1.3 checks both paths.
3. **House size:** 31,689 + 19,937 rows (\[M\], EU, 2026-11-05) versus 50-70k and 9 MB (\[T\], \[P\]). Probably market growth.
4. **Realms:** \[S\]'s realm models (beta data) versus 404 after launch. The 404 wins.
5. **Does Forever have an auction API at all?** auctionhouse.fyi says no; timesaver.gg says it uses the Game Data API. The four sources above show it exists. auctionhouse.fyi is wrong or out of date.
6. **buyout per stack or per unit:** unknown (T1.5).

## 2. Auction house and mail rules

The 1 copper minimum deposit is not live: Blizzard pulled it from the 10 Nov hotfix and says it goes live with weekly maintenance on 2026-11-17. That and the Temporary Economy Hold are the only rules with a primary source. The cut, the deposit formula and mail timings rest on guides and one addon page, so the tool should hold them as settings, not constants.

### 2.1 Rules at a glance

| Rule | Value | Tag | Source | Source date |
| --- | --- | --- | --- | --- |
| Minimum deposit now | 1 silver | CONFIRMED | US forum threads 2411380 and 2411025; hotfix thread post 7 | 2026-11-11 and 12 |
| Minimum deposit after maintenance | 1 copper (announced, not live) | CONFIRMED announced | Hotfix thread post 7 (Kaivax) | 2026-11-12 |
| 1 copper go-live | US weekly maintenance 2026-11-17; EU not checked | CONFIRMED for US | Hotfix thread post 7 | 2026-11-12 |
| Deposit refunded on sale | Yes | REPORTED | timesaver.gg; LFCarry | 2026-11-07 |
| Deposit lost on expiry or cancel | Yes | REPORTED | timesaver.gg | 2026-11-07 |
| Deposit formula | Unknown, based on vendor price | UNVERIFIED | LFCarry (beta) | 2026-09-16 |
| Durations | 2, 8, 24 hours | REPORTED (2 hours CONFIRMED by 2 sources) | AuxForever; thread 2411380 | 2026-11-10 and 11 |
| Faction house cut | 5% | UNVERIFIED | LFCarry (beta) | 2026-09-16 |
| Neutral house cut | 15% | UNVERIFIED | LFCarry (beta) | 2026-09-16 |
| Neutral houses | Gadgetzan, Booty Bay, Everlook | UNVERIFIED | LFCarry (beta) | 2026-09-16 |
| Stackables bought by quantity, cheapest first | Yes | CONFIRMED (2 sources) | AuxForever; U4N | 2026-11-10 and 11 |
| Stackable posted as one listing of any quantity | Yes | REPORTED | AuxForever | 2026-11-10 |
| Gear listed one by one, biddable | Yes | REPORTED | AuxForever | 2026-11-10 |
| Market scope | Per ruleset, per faction, per region | REPORTED | timesaver.gg (AH Ledger tracks 16 markets) | 2026-11-07 |
| Full scan | Once per 15 minutes | REPORTED | AuxForever | 2026-11-10 |
| Own-account mail | Near instant | REPORTED, pre-launch | AllThings.How | 2026-09-24 |
| Cross-faction mail | Not allowed | REPORTED, pre-launch | AllThings.How | 2026-09-24 |
| Postage with items | A few copper (30c in its example) | REPORTED, pre-launch | AllThings.How | 2026-09-24 |
| Temporary Economy Hold | Blocks trade, mail, guild bank and AH for suspected RMT accounts; no fixed length | CONFIRMED | Blue post 2381433 (Kaivax) | 2026-10-13 |

### 2.2 Cut on a sale

No primary source gives the Forever cut. LFCarry, a booster site whose AH details come from the beta (modified 2026-11-07), says 5% on faction houses and 15% on neutral houses: UNVERIFIED. The AuxForever addon shows the cut on its post receipt but prints no rate. warcraft.wiki.gg's Deposit fee page is generic and marked outdated. Default the tool to 5% and 15% and correct it from your first sale mails (T2.2).

### 2.3 Deposit formula

Guides and players agree the deposit follows vendor price, is refunded on sale and is lost on expiry or cancel, and each relist costs a new deposit (REPORTED, timesaver.gg, 2026-11-07). No Forever formula or per-duration multiplier was found anywhere. Data points:

- Enchanting dusts and essences carry a deposit despite having no vendor value (REPORTED secondhand via timesaver.gg). That fits a flat floor on zero-vendor items.
- A US player saw a 2 silver deposit on Mageweave on 2026-11-12, quantity and duration not stated (REPORTED, thread 2411025).
- The generic wiki values (15%, 30% and 60% of vendor price for 12, 24 and 48 hours, minimum 1 silver) are retail-era and do not match Forever's durations. Do not use them.
- No cancel penalty beyond the lost deposit was found.

Working model until T2.1 is run:

```latex
\text{deposit} = \max\left(\text{floor},\ f(\text{vendor price},\ \text{quantity},\ \text{duration})\right)
```

floor = 1 silver today, 1 copper after the 17 Nov maintenance. f is unknown. Whether the floor applies per listing or per unit is also unknown.

### 2.4 Listing durations

REPORTED: 2, 8 and 24 hours, Classic style, from AuxForever's duration setting (2026-11-10). A US player's "2-hour listing" (2026-11-11) independently confirms the 2-hour option. timesaver.gg mentions a 48-hour example in passing, which weakly conflicts. Read the dropdown in the post UI to settle it.

### 2.5 Minimum deposit and the 10 Nov hotfix

- CONFIRMED: the hotfix dated 2026-11-10 said the minimum deposit was adjusted to 1 copper (was 1 silver), "with realm restarts". Two players in separate threads quoted the line word for word. The hotfix post no longer contains it.
- CONFIRMED: on 2026-11-12 at 00:48 UTC, Kaivax posted in the hotfix thread that the AH changes were temporarily removed and will go live with weekly maintenance on November 17.
- CONFIRMED: at least five US players reported 1 silver still charged on 2026-11-11, and a retest on 2026-11-12 08:31 UTC still showed 1 silver.
- Blizzard said "AH changes", plural, so other unannounced AH changes may arrive on 17 Nov. Re-run T2.1 after that maintenance.
- EU forums were not checked. EU maintenance usually runs a day after US, so the EU go-live date is unconfirmed.

### 2.6 Commodities

Stackable trade goods behave like retail commodities: CONFIRMED by AuxForever (2026-11-10) and a gold seller's guide (U4N, updated 2026-11-11) for the buy side. Buyers choose a quantity and the cheapest units fill first; the buy flow asks the server for the real price and aborts if it rose. Sellers can post a stack as one listing of any quantity (REPORTED, AuxForever). Gear is listed one by one and can be bid on.

Scope is per ruleset and per faction, not region-wide like retail (REPORTED, timesaver.gg). Blizzard reportedly plans to link houses if a ruleset dries up (headline only, playnews.gg page unreachable). Whether equal-priced sellers fill newest first, as in retail, is not confirmed.

Consequences for the tool: model the price ladder, not "undercut by 1 copper"; expect partial fills, so proceeds arrive in several mails; and test whether a partly sold listing refunds deposit pro rata (T2.3).

### 2.7 Undercut rules, limits and neutral houses

No source mentions price floors, caps, undercut restrictions or listing-count limits (T2.5). Neutral houses are reportedly Gadgetzan, Booty Bay and Everlook at a 15% cut, from the beta booster guide only. Whether a neutral house is one shared market per ruleset is unknown. Players route gold across factions by listing a cheap item at a high price on a neutral house (REPORTED, pre-launch).

### 2.8 Throttling

REPORTED (AuxForever): "one Full scan every 15 minutes". Login alerts in the Americas on 2026-11-07 mentioned intermittent AH disruptions (REPORTED secondhand). No posting, cancel or search throttle values were found (T2.6). Section 5 covers the client-side API throttles.

### 2.9 Mail

Only one pre-launch guide covers Forever mail (AllThings.How, 2026-09-24, itself based on a video), so all of this is REPORTED:

- Mail between characters on the same account arrives almost immediately.
- Attaching items costs a small fee (30 copper in its example).
- Opposite factions cannot mail each other directly.
- No gold cap on mail between your own characters.
- A beta bug sent "can't send mail to yourself" errors between alts sharing a name.
- A character transfer needs an empty mailbox.

Not found for Forever: COD rules, mail expiry, attachment limit, delivery time to other players, and how long AH proceeds take (T2.4). This matters for your setup: if your main and bank alt are on opposite factions, you need the neutral house route.

### 2.10 Temporary Economy Hold

CONFIRMED ([blue post](https://us.forums.blizzard.com/en/wow/t/temporary-economy-holds-for-rmt/2381433) by Kaivax, 2026-10-13, pre-launch; Warcraft Tavern agrees, 2026-10-14). Accounts suspected of buying or selling gold for real money get trade, mail, guild bank and AH access restricted. It has no fixed length, lifts automatically if the account is cleared, leaves no permanent strike unless real-money trading is proven, and may hit false positives while it is tuned. It is not tied to account age or level. No hotfix since launch mentions it. One forum user claimed many players were blocked from the AH (UNVERIFIED). For the tool: large gold movements between your own characters are the sort of pattern such a system watches, so keep transfers proportionate.

### 2.11 Other economy rules

- AH usable at any level: UNVERIFIED (beta guide).
- Forever is realmless: players choose a ruleset (REPORTED).
- No source on a gold cap or on account-age gates for AH or mail.

### 2.12 Economy hotfixes since launch

All from the [Blizzard hotfix thread](https://us.forums.blizzard.com/en/wow/t/2403040), CONFIRMED; 5 Nov also confirmed by Warcraft Tavern (2026-11-06).

| Date | Change |
| --- | --- |
| 2026-11-12 | Blue post: AH changes removed from the previous update, going live with weekly maintenance on 2026-11-17 |
| 2026-11-11 | Item Restoration disabled while a bug is investigated; no AH items |
| 2026-11-10 | Minimum deposit 1 silver to 1 copper "with realm restarts" (later pulled) |
| 2026-11-10 | Racial vendor mounts now bind on pickup |
| 2026-11-10 | Vendors pay less for some crafted Leatherworking, Tailoring and Blacksmithing armor |
| 2026-11-10 | Minor Arcane Elixir sells for 5c (was 25c); Iron Grenade vendor price 1s 25c (was 5s) |
| 2026-11-10 | Swiftstrike Shot and Swiftfeather Arrow no longer bind on pickup |
| 2026-11-10 | Most quests from level 48 up now also reward gold |
| 2026-11-07 | Not a hotfix: Americas login alert about intermittent AH disruptions (REPORTED) |
| 2026-11-05 | Mild Spices vendor sell price 1c (was 2c); Zephras Isle trade vendors sell apprentice tradeskill bags |

### 2.13 Example prices

Examples only, from [timesaver.gg](https://timesaver.gg/blog/wow-forever-auction-house-prices-week-1), 2026-11-07. They show how far apart markets are, which is why the tool must key prices by region, ruleset and faction.

| Item | Region | Market | Price |
| --- | --- | --- | --- |
| Mageweave Cloth | EU | median of all markets | 10s 40c |
| Mageweave Cloth | US | median of all markets | about 13s 1c |
| Mageweave Cloth | US | PvP Alliance / PvP Horde | about 8s / about 18s |
| Iron Ore | EU | RP Horde | about 40s |
| Iron Ore | US | RP Alliance | about 15s |
| Linen Cloth | US and EU | median | 29-30c |

Icy Veins (three Forever AH articles) and playnews.gg could not be read, and the Blizzard news hotfix article body would not load.

## 3. Skinning and Leatherworking economics

The Leatherworking recipe list is complete by name, skill and pattern source (550 rows, 3.10), but reagents are sourced for only about 110 of them. Wowhead's Forever spell list would not load, so IDs, skill-up colours, workstation gating and bind status are mostly gaps. Fill them from DB2 data (Section 1 alternatives) or an in-game trainer dump (T3.1). The new Pristine and Fel materials gate nearly all new gear, but their sources and drop rates are known only from beta reports. No Leatherworking cooldown is confirmed for Forever.

### 3.1 Specializations

- REPORTED (wiki Forever patterns page, read 2026-11-12): all three exist at 225+: Dragonscale (mail for Hunters and Shamans), Elemental (agility leather for Feral Druids and Rogues), Tribal (intellect leather for druid healers and casters). A second read of the same page showed no prose, so open it in a browser to confirm.
- REPORTED ([wow-professions](https://www.wow-professions.com/forever/dragonscale-leatherworking), undated, author says higher levels are still being tested): the Dragonscale quest comes from the faction trainer and needs Leatherworking 225 and character level 40. You craft 2 Tough Scorpid Breastplate and 2 Tough Scorpid Gloves and bring 10 Worn Dragonscale. Shopping list: 36 Thick Leather, 40 Scorpid Scale, 12 Silken Thread, 10 Worn Dragonscale. Trainers: Peter Galen (Alliance, Ruins of Eldarath, Azshara) and Thorkaf Dragoneye (Horde, Badlands). The Tough Scorpid patterns drop from Wastewander Bandits and Thieves in Tanaris.
- Not found: Elemental and Tribal quests and trainers, swap or unlearn cost, and which recipes each spec gates in Forever, including whether the new 300 recipes need one. Classic Era baseline, not confirmed for Forever: Black and Blue Dragonscale were Dragonscale, Living and Warbear were Tribal, Devilsaur was Elemental.

### 3.2 Cooldown crafts

- No Forever source lists any Leatherworking recipe cooldown.
- Cured Rugged Hide (skill 225, trainer): 1 Rugged Hide + 1 Refined Deeprock Salt per craft (REPORTED, worked out from Wowhead's Forever levelling guide totals, 2026-11-04). The gate is the Refined Deeprock Salt from a Salt Shaker.
- Salt Shaker: the wiki page shows a 3-day cooldown, but it was last edited 2025-07-31, before Forever, and contradicts itself on who makes it (Leatherworking 250 in one place, Engineering 250 with 1 Mithril Casing, 6 Thorium Bar and 3 Gold Power Core in another). Classic Era baseline, not confirmed for Forever.
- CONFIRMED (wiki Tanning Rack and Sewing Machine pages plus wow-professions): each player can place camp items, and placing one puts all your camp items on a 1-hour shared cooldown.
- REPORTED (wow.gg): the Dedicated Study profession perk has a 23-hour cooldown. It is a perk, not a craft.
- Not found: any new Forever cooldown craft, for example Fel Hide into Fel Leather.

### 3.3 Pristine and Fel materials

Forever adds five "Scarce" reagents: Pristine Leather, Pristine Hide, Pristine Scale, Fel Hide and Fel Leather. Scarce materials are boosted by the Bountiful Harvest talent (+20/40/60/80/100%) (REPORTED, [Warcraft Tavern skinning](https://www.warcrafttavern.com/forever/guides/skinning/), undated).

| Material | ID | Known sources | Used by | Tag |
| --- | --- | --- | --- | --- |
| Pristine Leather | 249427 (ilvl 25, stack 20) | Beta reports: Westfall boars (12-15), Barrens plainstriders, raptors and Savannah Matriarchs (12-18), Silverpine Moonrage Gluttons and Darksouls (12-14), Darkshore and Mulgore wildlife, the Loch Modan rare Daggerfang (15), Wailing Caverns. Possible character-level cut-off around 25 and possible starting-zone exclusion. No drop rates. | 6-family sets at 60-125 (2-8 each), 7-family sets at 175-250 (1-5 each), Invulnerable Mail (20); also Blacksmithing and Tailoring | BETA-ERA, REPORTED ([expcarry](https://expcarry.com/pristine-leather-farming-wow-forever), 2026-10-14); uses REPORTED (wow.gg) |
| Pristine Hide | not found | not found | 7-family sets at 175-250 (2-10 each) | REPORTED (wow.gg) |
| Pristine Scale | not found | not found | Forceful and Mystic Rugged Armor Kits (1 each plus 1 Fel Hide); all 300 Pristine Scale gear (10 each plus 20 Fel Leather) | REPORTED (wow.gg) |
| Fel Hide | not found | not found | Forceful and Mystic Rugged Armor Kits | REPORTED (wow.gg) |
| Fel Leather | 248825 (stack 20, vendors for 7s 50c) | Skinned from beasts, no mobs named | The 300 new recipes: Grovekeeper, Spiritcaller, Wildstalker's, Grimstitch, Elderwild, Eternity Pauldrons, Mourning Handguards, Outlaw's Collar, Tranquil Wristguards, Wild Leather Armor Kit, Pristine Scale helms, legs and tunics | REPORTED ([wiki](https://warcraft.wiki.gg/wiki/Fel_Leather), edited 2026-11-04) |

CONFIRMED (Blizzard hotfix, 2026-11-09): the Shaper's Terrace bosses Vitrix, Snowtalon and Cinder now drop loot and higher-level skinning materials. Not found: whether Fel Leather is made from Fel Hide, and whether Bountiful Harvest raises Pristine rates. T3.6 measures drop rates.

### 3.4 Camp workstations

Every camp object needs a nearby Campfire, and all share the 1-hour placement cooldown. The Tanning Rack and Sewing Machine are said to be needed for "many" Leatherworking recipes (wow-professions) and "the most advanced" ones (wow.gg), but no source says which. The 300 Fel Leather recipes are the likely Sewing Machine set (inference). T3.3 settles it.

| Object | Skill | Pattern source | Reagents | Effect | Tag |
| --- | --- | --- | --- | --- | --- |
| Camp Tent (LW) | 20 | Trainer or "Camping 101" quest (wiki: quest) | 5 Light Leather | Rested XP up to 5% of a level, once an hour | CONFIRMED exists; reagents REPORTED |
| Tanning Rack (LW), item 279941 | 125 (was 140; hotfix 2026-11-06), colours 125/127/130 | Blueprint: Tanning Rack, drops from Razorclaw the Butcher (Shadowfang Keep) | 5 Medium Leather, 3 Fine Thread, 2 Simple Wood | Lets you make certain reagents; includes Camp Tent benefits; can replace a placed tent | CONFIRMED (wiki, wow-professions, Blizzard hotfix) |
| Sewing Machine (LW), item 279945 | 300 (all colours) | Blueprint: Sewing Machine, drop source unknown | 1 Undeath Engine, 5 Rugged Leather, 1 Rune Thread | Enables recipes that require it; includes Camp Tent benefits | CONFIRMED (wiki, wow-professions) |
| Camp Chair (Skinning) | 20 | Trainer or Camping 101 | 3 Light Leather, 2 Simple Wood | +2% crit (does not stack with Moonkin Aura) | REPORTED (wow-professions; WT agrees on +2% crit) |
| Field Guide (Skinning) | 140 | Blueprint from Lady Anacondra (Wailing Caverns) | 3 Medium Leather, 2 Slimy Murloc Scale, 1 Fine Thread | A book anyone can read to learn Track Beasts | REPORTED |
| Trapper's Workbench (Skinning) | 300 | Blueprint, source unknown | 2 Simple Wood, 4 Heavy Leather, 1 Iron Bar | Workbench with 1 trap | REPORTED |

REPORTED (wiki): Legacy perks Working Overtime and Dedicated Study and three Leatherworking camping perks exist; reaching skill 150, 225 and 300 each gives one Legacy Point.

### 3.5 Skinning spots

REPORTED ([Warcraft Tavern skinning overview](https://www.warcrafttavern.com/forever/guides/skinning/), undated). Zone brackets only; no per-mob data, yields or tapping rules were found, and nothing dated after launch ranks spots. Skinning is described as largely unchanged from Classic: creature level sets the skill needed, and you must loot fully first. The leather column is an inference from the skill band.

| Skill | Mob level | Zones (best in bold) | Main leather |
| --- | --- | --- | --- |
| 1-75 | starting zones | Durotar, Mulgore, Tirisfal, Dun Morogh, Elwynn, Teldrassil, Zephras Isle (new) | Ruined Scraps, Light |
| about 75-115 | 10-20 | Northern Barrens, Silverpine, Loch Modan, Darkshore, Westfall, Redridge | Light, Medium; Pristine Leather candidates (beta) |
| about 115-150 | 20-30 | Southern Barrens, Wetlands, Hillsbrad, Ashenvale, Duskwood, Redridge | Medium, Heavy |
| about 150-205 | 30-40 | **Thousand Needles (Shimmering Flats)**, Arathi, Desolace, Alterac, Stranglethorn, Swamp of Sorrows, Riverglades (new), Dustwallow, Badlands | Heavy, Thick, Scorpid Scale |
| about 205-260 | 40-50 | **Feralas**, Tanaris, Hinterlands, Searing Gorge, Azshara | Thick, Rugged |
| about 260-300 | 50-60 | **Un'Goro Crater**, Blasted Lands, Felwood, Western and Eastern Plaguelands, Azshara, Winterspring, Silithus | Rugged, Devilsaur, scales |

- Same source: you need a Skinning Knife in your bags and train at 75, 125 and 200. Bonuses: Keen Skinning Knife +3, Cartilage Shapers +4, Enchant Gloves Skinning +5, Advanced Skinning +10.
- BETA-ERA (expcarry): Pristine Leather loops at Westfall boars (Saldean's Farm), Barrens Crossroads to the raptor grounds, and Silverpine worgen from The Sepulcher to North Tide's Hollow.
- CONFIRMED (Blizzard): 2026-11-06, the quest "Rough Wolf Pelts" auto-cancels if you unlearn Skinning; 2026-11-09, Shaper's Terrace bosses drop higher-level skinning materials.

### 3.6 Waylaid Crates, Merchant's Favor and Craftsman's Writs

- REPORTED ([method.gg](https://www.method.gg/wow-forever/how-to-get-waylaid-crates-and-merchants-favor-in-wow-forever), 2026-11-03, the day before launch): Waylaid Crates drop in the world and from chests and can be traded on the AH. You fill one listed option and turn it in to Marcy Baker (Alliance, Azeroth Commerce Authority, Redridge) or Dokimi (Horde, Durotar Supplies and Logistics, the Barrens) for Merchant's Favor (MF) and reputation. Higher-tier crates give slightly more MF; amounts are not published. The first turn-in starts a one-time Shipping Label quest worth 50 MF.
- Leatherworker fills (same source): Textiles crates take 20 Light, Medium, Heavy, or Thick or Rugged Leather (Apprentice, Journeyman, Expert, Artisan; crate levels 10, 10, 20, 35). Fabrics crates take 2 Cured Light, Medium, Heavy or Thick Hide.
- MF sinks (REPORTED, [wow.gg](https://wow.gg/professions/forever/leatherworking) and method.gg): Leatherworking patterns at 30 MF (60-125 sets), 60 MF (175-210) and 90 MF (225-250 and the Mystic Rugged kit), sold by Daniel Stitchsong (Redridge) and Pawani (Barrens). Leatherworking Certification title 1000 MF (needs 300). Pack Kodo 6000 (Exalted), tabard 200 (Exalted), Packmule Treat 1500 (Revered), Advertising License toy 1200 (Honored).
- CONFLICT on vendor names: the wiki names Nina Surefire and Apothecary Durelle as MF recipe sellers. These may be different NPCs in the same hubs (T3.4).
- Craftsman's Writs: CONFIRMED to exist only through the 2026-11-09 hotfix that lets "Waylaid Crates and Craftsman's Writs" drop in dungeons. What they ask for and pay is undocumented.
- Value: with EU medians from 2026-11-11 (3.7), 20 Light Leather is about 8s 80c and 20 Rugged Leather about 2g 40c, so filling a crate costs little and the crate itself is the real price. Gold per MF cannot be computed until MF per crate is known (T3.5).

### 3.7 Profitability, with dated evidence

Only one dated source exists: [timesaver.gg](https://timesaver.gg/wow-forever/auction-prices), scans 2026-11-11 21:25 UTC (EU) and 21:22 UTC (US), medians across all rulesets with Alliance and Horde combined. It tracks no Pristine, Fel, hide or scale materials. Examples only.

| Item | EU | US |
| --- | --- | --- |
| Light Leather | 44c | 45c |
| Medium Leather | 1s 02c | 1s 15c |
| Heavy Leather | 2s 21c | 2s 89c |
| Thick Leather | 5s 67c | 7s |
| Rugged Leather | 12s | 10s 55c |
| Cured Heavy Hide | 16s 04c | 14s 44c |
| Thick Armor Kit | 14s 94c | 19s |
| Rune Thread | 63s | 59s |
| Vision Dust | 11s | 9s 80c |
| Soul Dust | 4s 84c | 4s 47c |
| Mana Potion | 3s 69c | 3s |

- Thick Armor Kit takes 5 Thick Leather + 1 Silken Thread (Wowhead guide). At EU medians that is 28s 35c of leather against a 14s 94c sale, so it loses money if you buy the leather: skill-ups or dumping your own leather only.
- Cured Heavy Hide sells for 16s 04c (EU) against 1 Heavy Hide + 3 Salt; Heavy Hide is not tracked, so check in game.
- CONFIRMED (Blizzard, 2026-11-10): vendor prices for some crafted Leatherworking armor were cut, so vendoring crafted greens pays less.
- The Pristine-set gear (Scarce materials, MF patterns, reportedly bind on equip per a beta-era Warcraft Tavern article) is the obvious profit candidate, but no prices exist yet. Your own scans will have to find these margins.

### 3.8 Differences from Classic Era

1. New: hundreds of patterns, including the Azure and Cloudy Gustwoven and Windraveled lines; the 6-family Pristine Leather sets (Brawler's, Defender's, Stormrider's, Totemic, Trapper's, Wisdom's); the 7-family sets (Mender's, Prowler's, Skirmisher's, Skulker's, Skycaller's, Stalker's, Warden's); Blue Suede, Tooled Leather, Charged and Supple Scorpid, Bileblister, Broodwatcher's, Hivethrasher's, Scalegut, Grovekeeper, Spiritcaller, Wildstalker's, Grimstitch, Elderwild; Forceful and Mystic armor kits for every tier.
2. New Scarce reagents: Pristine Leather, Pristine Hide, Pristine Scale, Fel Hide, Fel Leather.
3. New 300-skill trainer recipes using Pristine Scale and Fel Leather: Black and Blue Dragonscale Helm, Red Dragonscale Leggings, Pristine Scorpid Leggings, Dawn Armor, Ironfeather Leggings, Living Crown, Timbermaw Tunic, Warbear Helm.
4. Changed: Invulnerable Mail now uses Pristine Leather and Pristine Scale.
5. New camp workstations with a shared 1-hour cooldown.
6. New Merchant's Favor currency, Waylaid Crates, the two commerce reputations, Craftsman's Writs and a 1000 MF Certification title.
7. New Legacy Points at 150, 225 and 300, and perks (Working Overtime, Dedicated Study, Bountiful Harvest).
8. New zones: Zephras Isle, Riverglades, Shaper's Terrace.
9. Season of Discovery carry-overs on the wiki list (Gneuro and Rad-Resistant hoods, Scarlet Huntsman and Infiltrator, the Sanctum shoulders, and the 305-320 block below). Not Classic Era; Forever availability uncertain.
10. Hotfixes: Tanning Rack 140 to 125 (6 Nov); crates and writs drop in dungeons (9 Nov); lower vendor prices for crafted Leatherworking armor (10 Nov).

### 3.9 Conflicts

| Conflict | Side A | Side B | How to settle |
| --- | --- | --- | --- |
| Tanning Rack skill | 140 (wow.gg 2026-11-08, wow-professions) | 125 (wiki, Blizzard hotfix 2026-11-06) | Hotfix wins; confirm on the recipe tooltip (T3.3) |
| Forceful Rugged Armor Kit source | Vendor (wiki) | Trainer (wow.gg) | Check the trainer at 235 and the MF vendor |
| Invulnerable Mail skill | 300 (wiki) | 295 (wow.gg) | Read the pattern tooltip |
| Mid-tier set sources (100 Hood, 125 Legs, others) | Drop (wiki) | MF vendor (wow.gg) | Browse the MF vendor (T3.4); both can be true, as with Defender's Gloves |
| Gem-studded Leather Belt | Drop (wiki) | Vendor Rikqiz (Wowhead guide) | Visit Rikqiz in Booty Bay |
| Old recipes listed at two skills (Guardian, Turtle Scale, Big Voodoo) | Wiki lists both | - | Check the trainer; likely a wiki artefact |
| 80 Armor, 105 Pants, 130 Helm rows of the 6-family sets | Wiki, source "?" | Not in wow.gg vendor tables | Check the MF vendor and recipe list |
| 305-320 entries | Wiki lists them | Above the 300 cap | Treat as unobtainable until seen in game |
| MF recipe vendor | Nina Surefire, Apothecary Durelle (wiki) | Daniel Stitchsong, Pawani (wow.gg, wiki pattern page) | Visit both hubs (T3.4) |
| Salt Shaker cooldown | 3 days (pre-Forever wiki page) | No Forever source | Read the item's cooldown in game (T3.2) |

### 3.10 Full Leatherworking recipe table

Names, skill, old or new and pattern source come from the [wiki Forever leatherworking patterns list](https://warcraft.wiki.gg/wiki/Forever_leatherworking_patterns) (fetched 2026-11-12), which has no IDs, reagents, colours, cooldowns or bind data. Reagents for the Pristine sets and 300 Pristine Scale recipes come from [wow.gg](https://wow.gg/professions/forever/leatherworking) (2026-11-08). Levelling-recipe reagents are worked out from the material totals in [Wowhead's Forever levelling guide](https://www.wowhead.com/forever/profession-leveling-guides/leatherworking) (2026-11-04). A dash means no Forever reagent list was found; it was not filled from Classic Era, and the Pristine recipes show Forever did rebalance some reagents.

Tag codes:

- **W**: REPORTED, wiki list only. For old recipes, reagents are Classic Era baseline, not confirmed for Forever.
- **G**: name and skill CONFIRMED (wiki and wow.gg); reagents REPORTED (wow.gg).
- **F**: REPORTED, wiki list plus the Fel Leather page.
- **H**: REPORTED, wiki list; reagents derived from the Wowhead levelling guide.
- **P**: REPORTED, wiki list only, missing from wow.gg's vendor tables; may be unused placeholder data.
- **MF vendor, N MF**: sold for N Merchant's Favor by Daniel Stitchsong (Redridge, Alliance) and Pawani (Barrens, Horde), per wow.gg; the wiki calls these "Vendor".

Known IDs: Tanning Rack 279941, Sewing Machine 279945, Pattern: Defender's Leather Gloves 252779 (bind on pickup; drops from Deadmines and Ragefire Chasm bosses and is also sold for 30 MF), Pristine Leather 249427, Fel Leather 248825. No recipe cooldown appears in any Forever source. Bind status on crafted items: the new set items are bind on equip per a beta-era Warcraft Tavern article (2026-09-17); otherwise unknown.

Not in the table: 30 wiki entries at skill 305-320, above the 300 cap, with source "?" and Season of Discovery names. Treat them as unobtainable until seen in game: Bramblewood Belt, Boots and Helm; Dreamscale Breastplate and Kilt; Glowing Chitin Armor Kit; Honed Blue Dragonscale Leggings; Icy Scale Bracers, Breastplate and Gauntlets; Onyxia Scale Cloak; Polar Bracers, Gloves and Tunic; Razorbramble Cowl, Leathers and Shoulderpads; Sandstalker Bracers, Breastplate and Gauntlets; Sharpened Chitin Armor Kit; Spitfire Bracers, Breastplate and Gauntlets.

The table follows in three parts by skill.

**Part 1: skill 1 to 210**

| Skill | Recipe | Old/New | Pattern source | Reagents per craft | Tag; notes |
| --- | --- | --- | --- | --- | --- |
| 1 | Light Leather | Old | Automatic | 3 Ruined Leather Scraps | H |
| 1 | Light Armor Kit | Old | Automatic | 1 Light Leather | H |
| 1 | Handstitched Leather Boots | Old | Automatic | - | W |
| 1 | Handstitched Leather Bracers | Old | Automatic | - | W |
| 1 | Handstitched Leather Cloak | Old | Automatic | - | W |
| 1 | Handstitched Leather Vest | Old | Automatic | - | W |
| 15 | Handstitched Leather Pants | Old | Trainer | - | W |
| 20 | Camp Tent | New | Quest (wiki); Trainer or Camping 101 quest (wow-professions) | 5 Light Leather | Exists CONFIRMED; reagents REPORTED; camp object, 1-hour shared cooldown |
| 25 | Handstitched Leather Belt | Old | Trainer | - | W |
| 25 | Light Leather Quiver | Old | Trainer | - | W |
| 25 | Small Leather Ammo Pouch | Old | Trainer | - | W |
| 30 | Light Leather Reagent Bag | New | Quest | - | W |
| 30 | Cured Light Hide | Old | Trainer | 1 Light Hide, 1 Salt | H |
| 30 | Rugged Leather Pants | Old | Drop | - | W |
| 35 | Black Whelp Slippers | New | Vendor | - | W |
| 35 | Dark Leather Boots | New | Vendor | - | W |
| 35 | Moonglow Boots | New | Vendor | - | W |
| 35 | Murloc Scale Shoes | New | Vendor | - | W |
| 35 | Embossed Leather Vest | Old | Trainer | - | W |
| 35 | Kodo Hide Bag | Old | Quest | - | W |
| 40 | Embossed Leather Cloak | Old | Trainer | - | W |
| 40 | Embossed Leather Gloves | Old | Trainer | 3 Light Leather, 2 Coarse Thread | H |
| 40 | White Leather Jerkin | Old | Drop | - | W |
| 45 | Light Leather Bracers | Old | Trainer | - | W |
| 50 | Azure Gustwoven Belt | New | Vendor | - | W |
| 50 | Azure Gustwoven Bracers | New | Vendor | - | W |
| 50 | Azure Windraveled Armguards | New | Vendor | - | W |
| 50 | Azure Windraveled Strap | New | Vendor | - | W |
| 50 | Cloudy Gustwoven Belt | New | Vendor | - | W |
| 50 | Cloudy Gustwoven Bracers | New | Vendor | - | W |
| 50 | Cloudy Windraveled Armguards | New | Vendor | - | W |
| 50 | Cloudy Windraveled Strap | New | Vendor | - | W |
| 50 | Fine Leather Cloak | Old | Trainer | - | W |
| 50 | Embossed Leather Boots | Old | Trainer | - | W |
| 50 | Embossed Leather Pants | Old | Trainer | - | W |
| 50 | Fine Leather Gloves | Old | Drop | - | W |
| 55 | Azure Gustwoven Boots | New | Vendor | - | W |
| 55 | Azure Gustwoven Gloves | New | Vendor | - | W |
| 55 | Azure Windraveled Footwraps | New | Vendor | - | W |
| 55 | Azure Windraveled Mitts | New | Vendor | - | W |
| 55 | Cloudy Gustwoven Boots | New | Vendor | - | W |
| 55 | Cloudy Gustwoven Gloves | New | Vendor | - | W |
| 55 | Cloudy Windraveled Footwraps | New | Vendor | - | W |
| 55 | Cloudy Windraveled Mitts | New | Vendor | - | W |
| 55 | Fine Leather Belt | Old | Trainer | 6 Light Leather, 2 Coarse Thread | H |
| 60 | Azure Gustwoven Harness | New | Vendor | - | W |
| 60 | Azure Gustwoven Trousers | New | Vendor | - | W |
| 60 | Azure Windraveled Jerkin | New | Vendor | - | W |
| 60 | Azure Windraveled Pants | New | Vendor | - | W |
| 60 | Cloudy Gustwoven Harness | New | Vendor | - | W |
| 60 | Cloudy Gustwoven Trousers | New | Vendor | - | W |
| 60 | Cloudy Windraveled Jerkin | New | Vendor | - | W |
| 60 | Cloudy Windraveled Pants | New | Vendor | - | W |
| 60 | Brawler's Leather Belt | New | MF vendor, 30 MF | 10 Light Leather, 2 Cured Light Hide, 2 Pristine Leather, 1 Coarse Thread, 1 Shadowgem | G |
| 60 | Defender's Leather Belt | New | MF vendor, 30 MF | 10 Light Leather, 2 Cured Light Hide, 2 Pristine Leather, 1 Coarse Thread, 1 Elixir of Minor Fortitude | G |
| 60 | Stormrider's Leather Belt | New | MF vendor, 30 MF | 10 Light Leather, 2 Cured Light Hide, 2 Pristine Leather, 1 Coarse Thread, 1 Cerulean Dye | G |
| 60 | Totemic Leather Belt | New | MF vendor, 30 MF | 10 Light Leather, 2 Cured Light Hide, 2 Pristine Leather, 1 Coarse Thread, 1 Sulfuric Acid | G |
| 60 | Trapper's Leather Belt | New | MF vendor, 30 MF | 10 Light Leather, 2 Cured Light Hide, 2 Pristine Leather, 1 Coarse Thread, 1 Deviate Scale | G |
| 60 | Wisdom's Leather Belt | New | MF vendor, 30 MF | 10 Light Leather, 2 Cured Light Hide, 2 Pristine Leather, 1 Coarse Thread, 1 Small Lustrous Pearl | G |
| 60 | Fine Leather Tunic | Old | Trainer | - | W |
| 65 | Moonglow Vest | Old | Quest | - | W |
| 65 | Deviate Scale Cloak | Old | Vendor | - | W |
| 65 | Fine Leather Boots | Old | Drop | - | W |
| 65 | Murloc Scale Belt | Old | Drop | - | W |
| 70 | Light Leather Pants | Old | Trainer | - | W |
| 70 | Murloc Scale Breastplate | Old | Drop | - | W |
| 75 | Medium Leather | Old | Trainer | - | W |
| 75 | Cured Medium Hide | Old | Trainer | - | W |
| 75 | Medium Armor Kit | Old | Trainer | - | W |
| 75 | Black Whelp Cloak | Old | Drop | - | W |
| 75 | Black Whelp Tunic | Old | Drop | - | W |
| 75 | Brawler's Leather Gloves | New | Drop or MF vendor, 30 MF | 12 Light Leather, 3 Cured Light Hide, 2 Pristine Leather, 1 Fine Thread, 2 Shadowgem | G |
| 75 | Defender's Leather Gloves | New | Drops from Deadmines and Ragefire Chasm bosses, or MF vendor, 30 MF; pattern 252779, bind on pickup | 12 Light Leather, 3 Cured Light Hide, 2 Pristine Leather, 1 Fine Thread, 2 Elixir of Minor Fortitude | G; reagents also CONFIRMED by the wiki pattern page |
| 75 | Stormrider's Leather Gloves | New | Drop or MF vendor, 30 MF | 12 Light Leather, 3 Cured Light Hide, 2 Pristine Leather, 1 Fine Thread, 2 Cerulean Dye | G |
| 75 | Totemic Leather Gloves | New | Drop or MF vendor, 30 MF | 12 Light Leather, 3 Cured Light Hide, 2 Pristine Leather, 1 Fine Thread, 2 Sulfuric Acid | G |
| 75 | Trapper's Leather Gloves | New | Drop or MF vendor, 30 MF | 12 Light Leather, 3 Cured Light Hide, 2 Pristine Leather, 1 Fine Thread, 2 Deviate Scale | G |
| 75 | Wisdom's Leather Gloves | New | Drop or MF vendor, 30 MF | 12 Light Leather, 3 Cured Light Hide, 2 Pristine Leather, 1 Fine Thread, 2 Small Lustrous Pearl | G |
| 75 | Dark Leather Tunic | Old | Drop | - | W |
| 75 | Gray Leather Boots | Old | Trainer | 4 Medium Leather, 2 Fine Thread, 1 Gray Dye | H |
| 75 | Hillman's Leather Vest | Old | Drop | - | W |
| 80 | Brawler's Leather Armor | New | ? | - | P |
| 80 | Defender's Leather Armor | New | ? | - | P |
| 80 | Stormrider's Leather Armor | New | ? | - | P |
| 80 | Totemic Leather Armor | New | ? | - | P |
| 80 | Trapper's Leather Armor | New | ? | - | P |
| 80 | Wisdom's Leather Armor | New | ? | - | P |
| 80 | Forceful Medium Armor Kit | New | Vendor | - | W |
| 80 | Mystic Medium Armor Kit | New | Vendor | - | W |
| 80 | Deviate Scale Gloves | Old | Vendor | - | W |
| 80 | Fine Leather Pants | Old | Drop | - | W |
| 85 | Brawler's Leather Boots | New | MF vendor, 30 MF | 14 Light Leather, 4 Cured Light Hide, 3 Pristine Leather, 1 Fine Thread, 3 Shadowgem | G |
| 85 | Defender's Leather Boots | New | MF vendor, 30 MF | 14 Light Leather, 4 Cured Light Hide, 3 Pristine Leather, 1 Fine Thread, 3 Elixir of Minor Fortitude | G |
| 85 | Stormrider's Leather Boots | New | MF vendor, 30 MF | 14 Light Leather, 4 Cured Light Hide, 3 Pristine Leather, 1 Fine Thread, 3 Cerulean Dye | G |
| 85 | Totemic Leather Boots | New | MF vendor, 30 MF | 14 Light Leather, 4 Cured Light Hide, 3 Pristine Leather, 1 Fine Thread, 3 Sulfuric Acid | G |
| 85 | Trapper's Leather Boots | New | MF vendor, 30 MF | 14 Light Leather, 4 Cured Light Hide, 3 Pristine Leather, 1 Fine Thread, 3 Deviate Scale | G |
| 85 | Wisdom's Leather Boots | New | MF vendor, 30 MF | 14 Light Leather, 4 Cured Light Hide, 3 Pristine Leather, 1 Fine Thread, 3 Small Lustrous Pearl | G |
| 85 | Dark Leather Cloak | Old | Trainer | - | W |
| 90 | Dark Leather Pants | Old | Trainer | 12 Medium Leather, 1 Gray Dye, 1 Fine Thread | H |
| 90 | Deviate Scale Belt | Old | Quest | - | W |
| 95 | Nimble Leather Gloves | Old | Trainer | - | W |
| 95 | Red Whelp Gloves | Old | Drop | - | W |
| 95 | Toughened Leather Armor | Old | Trainer | - | W |
| 95 | Hillman's Belt | Old | Drop | - | W |
| 95 | Dark Leather Gloves | Old | Drop | - | W |
| 100 | Brawler's Leather Hood | New | Drop (wiki) or MF vendor, 30 MF (wow.gg) | 8 Medium Leather, 2 Cured Medium Hide, 4 Pristine Leather, 2 Fine Thread, 4 Shadowgem | G; source conflict |
| 100 | Defender's Leather Hood | New | Drop (wiki) or MF vendor, 30 MF (wow.gg) | 8 Medium Leather, 2 Cured Medium Hide, 4 Pristine Leather, 2 Fine Thread, 4 Elixir of Minor Fortitude | G; source conflict |
| 100 | Stormrider's Leather Hood | New | Drop (wiki) or MF vendor, 30 MF (wow.gg) | 8 Medium Leather, 2 Cured Medium Hide, 4 Pristine Leather, 2 Fine Thread, 4 Cerulean Dye | G; source conflict |
| 100 | Totemic Leather Hood | New | Drop (wiki) or MF vendor, 30 MF (wow.gg) | 8 Medium Leather, 2 Cured Medium Hide, 4 Pristine Leather, 2 Fine Thread, 4 Sulfuric Acid | G; source conflict |
| 100 | Trapper's Leather Hood | New | Drop (wiki) or MF vendor, 30 MF (wow.gg) | 8 Medium Leather, 2 Cured Medium Hide, 4 Pristine Leather, 2 Fine Thread, 4 Deviate Scale | G; source conflict |
| 100 | Wisdom's Leather Hood | New | Drop (wiki) or MF vendor, 30 MF (wow.gg) | 8 Medium Leather, 2 Cured Medium Hide, 4 Pristine Leather, 2 Fine Thread, 4 Small Lustrous Pearl | G; source conflict |
| 100 | Dark Leather Belt | Old | Trainer | 1 Fine Leather Belt, 1 Cured Medium Hide, 2 Fine Thread, 1 Gray Dye | H |
| 100 | Fletcher's Gloves | Old | Trainer | - | W |
| 105 | Brawler's Leather Pants | New | ? | - | P |
| 105 | Defender's Leather Pants | New | ? | - | P |
| 105 | Stormrider's Leather Pants | New | ? | - | P |
| 105 | Totemic Leather Pants | New | ? | - | P |
| 105 | Trapper's Leather Pants | New | ? | - | P |
| 105 | Wisdom's Leather Pants | New | ? | - | P |
| 105 | Hillman's Shoulders | Old | Trainer | - | W |
| 110 | Brawler's Leather Tunic | New | MF vendor, 30 MF | 10 Medium Leather, 3 Cured Medium Hide, 6 Pristine Leather, 3 Fine Thread, 6 Shadowgem | G |
| 110 | Defender's Leather Tunic | New | MF vendor, 30 MF | 10 Medium Leather, 3 Cured Medium Hide, 6 Pristine Leather, 3 Fine Thread, 6 Elixir of Minor Fortitude | G |
| 110 | Stormrider's Leather Tunic | New | MF vendor, 30 MF | 10 Medium Leather, 3 Cured Medium Hide, 6 Pristine Leather, 3 Fine Thread, 6 Cerulean Dye | G |
| 110 | Totemic Leather Tunic | New | MF vendor, 30 MF | 10 Medium Leather, 3 Cured Medium Hide, 6 Pristine Leather, 3 Fine Thread, 6 Sulfuric Acid | G |
| 110 | Trapper's Leather Tunic | New | MF vendor, 30 MF | 10 Medium Leather, 3 Cured Medium Hide, 6 Pristine Leather, 3 Fine Thread, 6 Deviate Scale | G |
| 110 | Wisdom's Leather Tunic | New | MF vendor, 30 MF | 10 Medium Leather, 3 Cured Medium Hide, 6 Pristine Leather, 3 Fine Thread, 6 Small Lustrous Pearl | G |
| 110 | Earthen Leather Shoulders | Old | Vendor | - | W |
| 110 | Herbalist's Gloves | Old | Drop | - | W |
| 110 | Hillman's Leather Boots | New | Drop | - | W; wiki marks it new though the name resembles a Classic item |
| 110 | Toughened Leather Gloves | Old | Trainer | 4 Medium Leather, 2 Cured Medium Hide, 2 Elixir of Lesser Defense, 2 Spider's Silk, 2 Fine Thread | H |
| 115 | Dark Leather Shoulders | Old | Drop | - | W |
| 115 | Pilferer's Gloves | Old | Drop | - | W |
| 120 | Heavy Earthen Gloves | Old | Drop | - | W |
| 120 | Hillman's Leather Gloves | Old | Trainer | - | W |
| 125 | Heavy Leather | Old | Trainer | - | W |
| 125 | Cured Heavy Hide | Old | Trainer | 1 Heavy Hide, 3 Salt | H |
| 125 | Heavy Armor Kit | Old | Trainer | - | W |
| 125 | Heavy Leather Ammo Pouch | Old | Trainer | - | W |
| 125 | Heavy Quiver | Old | Trainer | - | W |
| 125 | Hillman's Cloak | Old | Trainer | - | W |
| 125 | Barbaric Gloves | Old | Drop | - | W |
| 125 | Tanning Rack | New | Blueprint from Razorclaw the Butcher, Shadowfang Keep | 5 Medium Leather, 3 Fine Thread, 2 Simple Wood | CONFIRMED; item 279941; was 140 before the 6 Nov hotfix; colours 125/127/130; camp object |
| 125 | Brawler's Leather Legguards | New | Drop (wiki) or MF vendor, 30 MF (wow.gg) | 12 Medium Leather, 4 Cured Medium Hide, 8 Pristine Leather, 3 Fine Thread, 8 Shadowgem | G; source conflict |
| 125 | Defender's Leather Kilt | New | Drop (wiki) or MF vendor, 30 MF (wow.gg) | 12 Medium Leather, 4 Cured Medium Hide, 8 Pristine Leather, 3 Fine Thread, 8 Elixir of Minor Fortitude | G; source conflict |
| 125 | Stormrider's Leather Kilt | New | Drop (wiki) or MF vendor, 30 MF (wow.gg) | 12 Medium Leather, 4 Cured Medium Hide, 8 Pristine Leather, 3 Fine Thread, 8 Cerulean Dye | G; source conflict |
| 125 | Totemic Leather Leggings | New | Drop (wiki) or MF vendor, 30 MF (wow.gg) | 12 Medium Leather, 4 Cured Medium Hide, 8 Pristine Leather, 3 Fine Thread, 8 Sulfuric Acid | G; source conflict |
| 125 | Trapper's Leather Legguards | New | Drop (wiki) or MF vendor, 30 MF (wow.gg) | 12 Medium Leather, 4 Cured Medium Hide, 8 Pristine Leather, 3 Fine Thread, 8 Deviate Scale | G; source conflict |
| 125 | Wisdom's Leather Leggings | New | Drop (wiki) or MF vendor, 30 MF (wow.gg) | 12 Medium Leather, 4 Cured Medium Hide, 8 Pristine Leather, 3 Fine Thread, 8 Small Lustrous Pearl | G; source conflict |
| 130 | Brawler's Leather Helm | New | ? | - | P |
| 130 | Defender's Leather Helm | New | ? | - | P |
| 130 | Stormrider's Leather Helm | New | ? | - | P |
| 130 | Totemic Leather Helm | New | ? | - | P |
| 130 | Trapper's Leather Helm | New | ? | - | P |
| 130 | Wisdom's Leather Helm | New | ? | - | P |
| 130 | Green Leather Armor | Old | Vendor | - | W |
| 130 | Barbaric Bracers | Old | Vendor | - | W |
| 135 | Forceful Heavy Armor Kit | New | Vendor | - | W |
| 135 | Green Leather Belt | Old | Trainer | - | W |
| 135 | Guardian Pants | Old | Trainer | - | W; also listed at 160 |
| 135 | Mystic Heavy Armor Kit | New | Vendor | - | W |
| 140 | Dusky Leather Leggings | Old | Drop | - | W |
| 140 | Raptor Hide Belt | Old | Drop | - | W |
| 140 | Raptor Hide Harness | Old | Drop | - | W |
| 145 | Barbaric Leggings | Old | Vendor | - | W |
| 145 | Guardian Belt | Old | Drop | - | W; also listed at 170 |
| 145 | Thick Murloc Armor | Old | Drop | - | W |
| 150 | Heavy Leather Ball | Old | Vendor | - | W |
| 150 | Mender's Leather Belt | New | Vendor | - (not in wow.gg tables) | W |
| 150 | Prowler's Leather Belt | New | Vendor | - (not in wow.gg tables) | W |
| 150 | Skirmisher's Leather Belt | New | Vendor | - (not in wow.gg tables) | W |
| 150 | Skulker's Leather Belt | New | Vendor | - (not in wow.gg tables) | W |
| 150 | Skycaller's Leather Belt | New | Vendor | - (not in wow.gg tables) | W |
| 150 | Stalker's Leather Belt | New | Vendor | - (not in wow.gg tables) | W |
| 150 | Warden's Leather Belt | New | Vendor | - (not in wow.gg tables) | W |
| 150 | Barbaric Shoulders | Old | Trainer | 8 Heavy Leather, 1 Cured Heavy Hide, 2 Fine Thread | H |
| 150 | Dusky Leather Armor | Old | Trainer | - | W |
| 150 | Green Whelp Armor | Old | Drop | - | W |
| 150 | Guardian Armor | Old | Drop | - | W |
| 155 | Frost Leather Cloak | Old | Trainer | - | W |
| 155 | Green Leather Bracers | Old | Trainer | - | W |
| 160 | Void-Touched Leather Gauntlets | Old | ? | - | W |
| 160 | Void-Touched Leather Gloves | Old | ? | - | W |
| 160 | Dusky Bracers | Old | Trainer | - | W |
| 160 | Gem-studded Leather Belt | Old | Drop (wiki); vendor Rikqiz (Wowhead guide) | 4 Cured Heavy Hide, 2 Iridescent Pearl, 2 Jade, 1 Citrine, 1 Fine Thread | H; source conflict |
| 160 | Guardian Cloak | Old | Drop | - | W |
| 160 | Guardian Pants | Old | Trainer | - | W; duplicate of the 135 row |
| 165 | Barbaric Harness | Old | Trainer | - | W |
| 165 | Gloves of the Greatfather | Old | Drop | - | W |
| 165 | Green Whelp Bracers | Old | Vendor | - | W |
| 165 | Guardian Gloves | Old | Trainer | 4 Heavy Leather, 1 Cured Heavy Hide, 1 Silken Thread | H |
| 165 | Murloc Scale Bracers | Old | Drop | - | W |
| 170 | Dusky Belt | Old | Trainer | - | W |
| 170 | Guardian Belt | Old | Drop | - | W; duplicate of the 145 row |
| 170 | Guardian Leather Bracers | Old | Drop | - | W; also listed at 195 |
| 175 | Cured Thick Hide | Old | Trainer | - | W |
| 175 | Thick Leather | Old | Trainer | - | W |
| 175 | Azure Gustwoven Hood | New | Vendor | - | W |
| 175 | Azure Gustwoven Spaulders | New | Vendor | - | W |
| 175 | Azure Windraveled Cover | New | Vendor | - | W |
| 175 | Azure Windraveled Drapes | New | Vendor | - | W |
| 175 | Cloudy Gustwoven Hood | New | Vendor | - | W |
| 175 | Cloudy Gustwoven Spaulders | New | Vendor | - | W |
| 175 | Cloudy Windraveled Cover | New | Vendor | - | W |
| 175 | Cloudy Windraveled Drapes | New | Vendor | - | W |
| 175 | Shadowskin Gloves | Old | Vendor | - | W |
| 175 | Barbaric Belt | Old | Drop | - | W |
| 175 | Comfortable Leather Hat | Old | Drop | - | W |
| 175 | Dusky Boots | Old | Drop | - | W |
| 175 | Mender's Leather Gloves | New | MF vendor, 60 MF | 16 Heavy Leather, 2 Cured Heavy Hide, 2 Pristine Hide, 2 Silken Thread, 2 Iridescent Pearl, 1 Pristine Leather | G |
| 175 | Prowler's Leather Gloves | New | MF vendor, 60 MF | 16 Heavy Leather, 2 Cured Heavy Hide, 2 Pristine Hide, 2 Silken Thread, 2 Jade, 1 Pristine Leather | G |
| 175 | Skirmisher's Leather Gloves | New | MF vendor, 60 MF | 16 Heavy Leather, 2 Cured Heavy Hide, 2 Pristine Hide, 2 Silken Thread, 2 Citrine, 1 Pristine Leather | G |
| 175 | Skulker's Leather Gloves | New | MF vendor, 60 MF | 16 Heavy Leather, 2 Cured Heavy Hide, 2 Pristine Hide, 2 Silken Thread, 2 Spider's Silk, 1 Pristine Leather | G |
| 175 | Skycaller's Leather Gloves | New | MF vendor, 60 MF | 16 Heavy Leather, 2 Cured Heavy Hide, 2 Pristine Hide, 2 Silken Thread, 2 Elemental Water, 1 Pristine Leather | G |
| 175 | Stalker's Leather Gloves | New | MF vendor, 60 MF | 16 Heavy Leather, 2 Cured Heavy Hide, 2 Pristine Hide, 2 Silken Thread, 2 Elemental Air, 1 Pristine Leather | G |
| 175 | Warden's Leather Gloves | New | MF vendor, 60 MF | 16 Heavy Leather, 2 Cured Heavy Hide, 2 Pristine Hide, 2 Silken Thread, 2 Elemental Earth, 1 Pristine Leather | G |
| 175 | Swift Boots | Old | Drop | - | W |
| 175 | Thick Armor Kit | Old | Trainer | 5 Thick Leather, 1 Silken Thread | H |
| 180 | Nightscape Headband | Old | Trainer | - | W |
| 180 | Nightscape Tunic | Old | Trainer | - | W |
| 180 | Turtle Scale Gloves | Old | Drop | - | W; also listed at 205 |
| 185 | Forceful Thick Armor Kit | New | Vendor | -; a pre-beta Warcraft Tavern article says upgraded kits take the base kit as a reagent | W |
| 185 | Mystic Thick Armor Kit | New | Quest | - | W |
| 185 | Nightscape Shoulders | Old | Vendor | - | W |
| 185 | Turtle Scale Bracers | Old | Trainer | - | W |
| 185 | Turtle Scale Breastplate | Old | Trainer | - | W; also listed at 210 |
| 190 | Big Voodoo Robe | Old | Drop | - | W; also listed at 215 |
| 195 | Big Voodoo Mask | Old | Drop | - | W; also listed at 220 |
| 195 | Guardian Leather Bracers | Old | Drop | - | W; duplicate of the 170 row |
| 195 | Tough Scorpid Bracers | Old | Drop | - | W |
| 195 | Tough Scorpid Breastplate | Old | Drop | - | W; pattern drops from Wastewander Bandits, Tanaris; 2 needed for the Dragonscale quest |
| 195 | Wild Leather Shoulders | Old | Quest | - | W |
| 200 | Faintly Glowing Leather | Old | Vendor | - | W |
| 200 | Mender's Leather Shoes | New | Drop | - (not in wow.gg tables) | W |
| 200 | Mender's Mail Boots | New | Drop | - (not in wow.gg tables) | W |
| 200 | Prowler's Leather Shoes | New | ? | - (not in wow.gg tables) | W |
| 200 | Skirmisher's Mail Boots | New | ? | - (not in wow.gg tables) | W |
| 200 | Skulker's Leather Shoes | New | ? | - (not in wow.gg tables) | W |
| 200 | Skycaller's Leather Shoes | New | Drop | - (not in wow.gg tables) | W |
| 200 | Skycaller's Mail Boots | New | ? | - (not in wow.gg tables) | W |
| 200 | Stalker's Mail Boots | New | ? | - (not in wow.gg tables) | W |
| 200 | Warden's Leather Shoes | New | Drop | - (not in wow.gg tables) | W |
| 200 | Quickdraw Quiver | Old | Trainer | - | W |
| 200 | Thick Leather Ammo Pouch | Old | Trainer | - | W |
| 200 | Tough Scorpid Gloves | Old | Drop | - | W; pattern drops from Wastewander Thieves, Tanaris; 2 needed for the Dragonscale quest |
| 200 | Wild Leather Helmet | Old | Quest | - | W |
| 200 | Wild Leather Vest | Old | Quest | - | W |
| 205 | Nightscape Pants | Old | Trainer | 14 Thick Leather, 4 Silken Thread | H |
| 205 | Turtle Scale Gloves | Old | Drop | - | W; duplicate of the 180 row |
| 205 | Turtle Scale Helm | Old | Trainer | - | W |
| 210 | Mender's Mail Shoulders | New | MF vendor, 60 MF | 10 Thick Leather, 3 Cured Heavy Hide, 4 Pristine Hide, 2 Silken Thread, 3 Iridescent Pearl, 2 Pristine Leather | G |
| 210 | Skirmisher's Mail Shoulders | New | MF vendor, 60 MF | 10 Thick Leather, 3 Cured Heavy Hide, 4 Pristine Hide, 2 Silken Thread, 3 Citrine, 2 Pristine Leather | G |
| 210 | Skycaller's Mail Shoulders | New | MF vendor, 60 MF | 10 Thick Leather, 3 Cured Heavy Hide, 4 Pristine Hide, 2 Silken Thread, 3 Elemental Water, 2 Pristine Leather | G |

**Part 2: skill 210 to 300 (first half of the 300 recipes)**

In F rows, "Fel Leather, rest not found" means the wiki Fel Leather page lists the recipe as a user and no full reagent list was found.

| Skill | Recipe | Old/New | Pattern source | Reagents per craft | Tag; notes |
| --- | --- | --- | --- | --- | --- |
| 210 | Stalker's Mail Shoulders | New | MF vendor, 60 MF | 10 Thick Leather, 3 Cured Heavy Hide, 4 Pristine Hide, 2 Silken Thread, 3 Elemental Air, 2 Pristine Leather | G |
| 210 | Mender's Leather Shoulders | New | MF vendor, 60 MF | 10 Thick Leather, 3 Cured Heavy Hide, 4 Pristine Hide, 2 Silken Thread, 3 Iridescent Pearl, 2 Pristine Leather | G |
| 210 | Prowler's Leather Shoulders | New | MF vendor, 60 MF | 10 Thick Leather, 3 Cured Heavy Hide, 4 Pristine Hide, 2 Silken Thread, 3 Jade, 2 Pristine Leather | G |
| 210 | Skulker's Leather Shoulders | New | MF vendor, 60 MF | 10 Thick Leather, 3 Cured Heavy Hide, 4 Pristine Hide, 2 Silken Thread, 3 Spider's Silk, 2 Pristine Leather | G |
| 210 | Skycaller's Leather Shoulders | New | MF vendor, 60 MF | 10 Thick Leather, 3 Cured Heavy Hide, 4 Pristine Hide, 2 Silken Thread, 3 Elemental Water, 2 Pristine Leather | G |
| 210 | Warden's Leather Shoulders | New | MF vendor, 60 MF | 10 Thick Leather, 3 Cured Heavy Hide, 4 Pristine Hide, 2 Silken Thread, 3 Elemental Earth, 2 Pristine Leather | G |
| 210 | Nightscape Boots | Old | Trainer | - | W |
| 210 | Tough Scorpid Boots | Old | Drop | - | W |
| 210 | Turtle Scale Breastplate | Old | Trainer | - | W; duplicate of the 185 row |
| 210 | Turtle Scale Leggings | Old | Trainer | - | W |
| 215 | Big Voodoo Pants | Old | Drop | - | W |
| 215 | Big Voodoo Cloak | Old | Drop | - | W |
| 215 | Big Voodoo Robe | Old | Drop | - | W; duplicate of the 190 row |
| 215 | Tough Scorpid Shoulders | Old | Drop | - | W |
| 220 | Big Voodoo Mask | Old | Drop | - | W; duplicate of the 195 row |
| 220 | Tough Scorpid Leggings | Old | Drop | - | W |
| 220 | Wild Leather Boots | Old | Quest | - | W |
| 225 | Dragonscale Gauntlets | Old | Trainer | - | W; Dragonscale recipe in Classic Era; Forever gating not confirmed |
| 225 | Mender's Mail Bracers | New | MF vendor, 90 MF | 12 Thick Leather, 4 Cured Heavy Hide, 6 Pristine Hide, 2 Heavy Silken Thread, 4 Iridescent Pearl, 3 Pristine Leather | G |
| 225 | Skirmisher's Mail Bracers | New | MF vendor, 90 MF | 12 Thick Leather, 4 Cured Heavy Hide, 6 Pristine Hide, 2 Heavy Silken Thread, 4 Citrine, 3 Pristine Leather | G |
| 225 | Skycaller's Mail Bracers | New | MF vendor, 90 MF | 12 Thick Leather, 4 Cured Heavy Hide, 6 Pristine Hide, 2 Heavy Silken Thread, 4 Elemental Water, 3 Pristine Leather | G |
| 225 | Stalker's Mail Bracers | New | MF vendor, 90 MF | 12 Thick Leather, 4 Cured Heavy Hide, 6 Pristine Hide, 2 Heavy Silken Thread, 4 Elemental Air, 3 Pristine Leather | G |
| 225 | Wolfshead Helm | Old | ? | - | W; Tribal recipe in Classic Era; Forever gating not confirmed |
| 225 | Rugged Leather | Old | Trainer | - | W |
| 225 | Cured Rugged Hide | Old | Trainer | 1 Rugged Hide, 1 Refined Deeprock Salt | H; no recipe cooldown found; gated by Salt Shaker output (3.2) |
| 225 | Glowing Gneuro-Linked Cowl | Old | Vendor | - | W; Season of Discovery name |
| 225 | Glowing Hyperconductive Scale Coif | Old | Vendor | - | W; Season of Discovery name |
| 225 | Gneuro-Conductive Channeler's Hood | Old | Vendor | - | W; Season of Discovery name |
| 225 | Rad-Resistant Scale Hood | Old | Vendor | - | W; Season of Discovery name |
| 225 | Rugged Armor Kit | Old | Trainer | - | W |
| 225 | Mender's Leather Bracers | New | MF vendor, 90 MF | 12 Thick Leather, 4 Cured Heavy Hide, 6 Pristine Hide, 2 Heavy Silken Thread, 4 Iridescent Pearl, 3 Pristine Leather | G |
| 225 | Prowler's Leather Bracers | New | MF vendor, 90 MF | 12 Thick Leather, 4 Cured Heavy Hide, 6 Pristine Hide, 2 Heavy Silken Thread, 4 Jade, 3 Pristine Leather | G |
| 225 | Skulker's Leather Bracers | New | MF vendor, 90 MF | 12 Thick Leather, 4 Cured Heavy Hide, 6 Pristine Hide, 2 Heavy Silken Thread, 4 Spider's Silk, 3 Pristine Leather | G |
| 225 | Skycaller's Leather Bracers | New | MF vendor, 90 MF | 12 Thick Leather, 4 Cured Heavy Hide, 6 Pristine Hide, 2 Heavy Silken Thread, 4 Elemental Water, 3 Pristine Leather | G |
| 225 | Warden's Leather Bracers | New | MF vendor, 90 MF | 12 Thick Leather, 4 Cured Heavy Hide, 6 Pristine Hide, 2 Heavy Silken Thread, 4 Elemental Earth, 3 Pristine Leather | G |
| 225 | Tough Scorpid Helm | Old | Drop | - | W |
| 225 | Wild Leather Cloak | Old | Quest | - | W |
| 225 | Wild Leather Leggings | Old | Quest | - | W |
| 230 | Gauntlets of the Sea | Old | ? | - | W |
| 230 | Charged Scorpid Belt | New | ? | - | W |
| 230 | Supple Scorpid Boots | New | ? | - | W |
| 235 | Forceful Rugged Armor Kit | New | Vendor (wiki) or Trainer (wow.gg) | 1 Rugged Armor Kit, 2 Dream Dust, 2 Elixir of Greater Strength, 1 Pristine Scale, 1 Fel Hide | G; source conflict |
| 235 | Mystic Rugged Armor Kit | New | MF vendor, 90 MF | 1 Rugged Armor Kit, 2 Dream Dust, 2 Major Mana Potion, 1 Pristine Scale, 1 Fel Hide | G |
| 235 | Blue Suede Shoes | New | ? | - | W |
| 235 | Green Dragonscale Breastplate | Old | Vendor | - | W |
| 235 | Mender's Leather Boots | New | MF vendor, 90 MF | 16 Thick Leather, 2 Cured Thick Hide, 8 Pristine Hide, 2 Heavy Silken Thread, 6 Iridescent Pearl, 4 Pristine Leather | G |
| 235 | Mender's Mail Sabatons | New | MF vendor, 90 MF | 16 Thick Leather, 2 Cured Thick Hide, 8 Pristine Hide, 2 Heavy Silken Thread, 6 Iridescent Pearl, 4 Pristine Leather | G |
| 235 | Prowler's Leather Boots | New | MF vendor, 90 MF | 16 Thick Leather, 2 Cured Thick Hide, 8 Pristine Hide, 2 Heavy Silken Thread, 6 Jade, 4 Pristine Leather | G |
| 235 | Skirmisher's Mail Sabatons | New | MF vendor, 90 MF | 16 Thick Leather, 2 Cured Thick Hide, 8 Pristine Hide, 2 Heavy Silken Thread, 6 Citrine, 4 Pristine Leather | G |
| 235 | Skulker's Leather Boots | New | MF vendor, 90 MF | 16 Thick Leather, 2 Cured Thick Hide, 8 Pristine Hide, 2 Heavy Silken Thread, 6 Spider's Silk, 4 Pristine Leather | G |
| 235 | Skycaller's Leather Boots | New | MF vendor, 90 MF | 16 Thick Leather, 2 Cured Thick Hide, 8 Pristine Hide, 2 Heavy Silken Thread, 6 Elemental Water, 4 Pristine Leather | G |
| 235 | Skycaller's Mail Sabatons | New | MF vendor, 90 MF | 16 Thick Leather, 2 Cured Thick Hide, 8 Pristine Hide, 2 Heavy Silken Thread, 6 Elemental Water, 4 Pristine Leather | G |
| 235 | Stalker's Mail Sabatons | New | MF vendor, 90 MF | 16 Thick Leather, 2 Cured Thick Hide, 8 Pristine Hide, 2 Heavy Silken Thread, 6 Elemental Air, 4 Pristine Leather | G |
| 235 | Tooled Leather Belt | New | ? | - | W |
| 235 | Warden's Leather Boots | New | MF vendor, 90 MF | 16 Thick Leather, 2 Cured Thick Hide, 8 Pristine Hide, 2 Heavy Silken Thread, 6 Elemental Earth, 4 Pristine Leather | G |
| 235 | Wicked Leather Gauntlets | Old | Vendor: Leonard Porter (Alliance), Werg Thickblade (Horde), per Wowhead guide | 8 Rugged Leather, 1 Black Dye, 1 Rune Thread | H |
| 240 | Blue Suede Gloves | New | ? | - | W |
| 240 | Charged Scorpid Helm | New | ? | - | W |
| 240 | Chimeric Gloves | Old | Vendor | - | W |
| 240 | Heavy Scorpid Vest | Old | Drop | - | W |
| 240 | Supple Scorpid Leggings | New | ? | - | W |
| 240 | Tooled Leather Boots | New | ? | - | W |
| 240 | Wicked Leather Bracers | Old | Drop | - | W |
| 245 | Green Dragonscale Leggings | Old | Drop | - | W |
| 245 | Ironfeather Shoulders | Old | Vendor | - | W |
| 245 | Living Shoulders | Old | Vendor | - | W |
| 245 | Runic Leather Gauntlets | Old | Drop | - | W |
| 245 | Volcanic Leggings | Old | Drop | - | W |
| 250 | Cacophonous Chain Shoulderguards | Old | ? | - | W; Season of Discovery name |
| 250 | Membrane of Dark Neurosis | Old | ? | - | W; Season of Discovery name |
| 250 | Paranoia Mantle | Old | ? | - | W; Season of Discovery name |
| 250 | Screaming Chain Pauldrons | Old | ? | - | W; Season of Discovery name |
| 250 | Shoulderpads of Obsession | Old | ? | - | W; Season of Discovery name |
| 250 | Shrieking Spaulders | Old | ? | - | W; Season of Discovery name |
| 250 | Wailing Chain Mantle | Old | ? | - | W; Season of Discovery name |
| 250 | Feathered Breastplate | Old | ? | - | W |
| 250 | Helm of Fire | Old | ? | - | W |
| 250 | Mender's Leather Gauntlets | New | ? | - | W; may duplicate the 175 gloves |
| 250 | Mender's Mail Gauntlets | New | ? | - | W; may duplicate the 175 gloves |
| 250 | Prowler's Leather Gauntlets | New | ? | - | W; may duplicate the 175 gloves |
| 250 | Skirmisher's Mail Gauntlets | New | ? | - | W; may duplicate the 175 gloves |
| 250 | Skulker's Leather Gauntlets | New | ? | - | W; may duplicate the 175 gloves |
| 250 | Skycaller's Leather Gauntlets | New | ? | - | W; may duplicate the 175 gloves |
| 250 | Skycaller's Mail Gauntlets | New | ? | - | W; may duplicate the 175 gloves |
| 250 | Stalker's Mail Gauntlets | New | ? | - | W; may duplicate the 175 gloves |
| 250 | Warden's Leather Gauntlets | New | ? | - | W; may duplicate the 175 gloves |
| 250 | Scarlet Huntsman's Clasp | Old | Drop | - | W; Season of Discovery name |
| 250 | Scarlet Huntsman's Wristguards | Old | Drop | - | W; Season of Discovery name |
| 250 | Scarlet Infiltrator's Belt | Old | Drop | - | W; Season of Discovery name |
| 250 | Scarlet Infiltrator's Bracers | Old | Drop | - | W; Season of Discovery name |
| 250 | Charged Scorpid Shoulders | New | ? | - | W |
| 250 | Chimeric Boots | Old | Drop | - | W |
| 250 | Frostsaber Boots | Old | Vendor | - | W |
| 250 | Heavy Scorpid Gauntlets | Old | Drop | - | W |
| 250 | Mender's Leather Waistguard | New | MF vendor, 90 MF | 12 Rugged Leather, 4 Cured Thick Hide, 10 Pristine Hide, 2 Heavy Silken Thread, 8 Iridescent Pearl, 5 Pristine Leather | G |
| 250 | Mender's Mail Belt | New | MF vendor, 90 MF | 12 Rugged Leather, 4 Cured Thick Hide, 10 Pristine Hide, 2 Heavy Silken Thread, 8 Iridescent Pearl, 5 Pristine Leather | G |
| 250 | Prowler's Leather Waistguard | New | MF vendor, 90 MF | 12 Rugged Leather, 4 Cured Thick Hide, 10 Pristine Hide, 2 Heavy Silken Thread, 8 Jade, 5 Pristine Leather | G |
| 250 | Runic Leather Bracers | Old | Drop | - | W |
| 250 | Skirmisher's Mail Belt | New | MF vendor, 90 MF | 12 Rugged Leather, 4 Cured Thick Hide, 10 Pristine Hide, 2 Heavy Silken Thread, 8 Citrine, 5 Pristine Leather | G |
| 250 | Skulker's Leather Waistguard | New | MF vendor, 90 MF | 12 Rugged Leather, 4 Cured Thick Hide, 10 Pristine Hide, 2 Heavy Silken Thread, 8 Spider's Silk, 5 Pristine Leather | G |
| 250 | Skycaller's Leather Waistguard | New | MF vendor, 90 MF | 12 Rugged Leather, 4 Cured Thick Hide, 10 Pristine Hide, 2 Heavy Silken Thread, 8 Elemental Water, 5 Pristine Leather | G |
| 250 | Skycaller's Mail Belt | New | MF vendor, 90 MF | 12 Rugged Leather, 4 Cured Thick Hide, 10 Pristine Hide, 2 Heavy Silken Thread, 8 Elemental Water, 5 Pristine Leather | G |
| 250 | Stalker's Mail Belt | New | MF vendor, 90 MF | 12 Rugged Leather, 4 Cured Thick Hide, 10 Pristine Hide, 2 Heavy Silken Thread, 8 Elemental Air, 5 Pristine Leather | G |
| 250 | Stormshroud Pants | Old | Vendor | - | W |
| 250 | Supple Scorpid Bracers | New | ? | - | W |
| 250 | Warbear Harness | Old | Drop | - | W |
| 250 | Warden's Leather Waistguard | New | MF vendor, 90 MF | 12 Rugged Leather, 4 Cured Thick Hide, 10 Pristine Hide, 2 Heavy Silken Thread, 8 Elemental Earth, 5 Pristine Leather | G |
| 255 | Dragonscale Breastplate | Old | Trainer | - | W |
| 255 | Heavy Scorpid Bracers | Old | Vendor: Zannok Hidepiercer (Wowhead guide) | 4 Rugged Leather, 4 Heavy Scorpid Scale, 1 Rune Thread | H |
| 255 | Blue Suede Pants | New | ? | - | W |
| 255 | Charged Scorpid Bracers | New | ? | - | W |
| 255 | Charged Scorpid Gauntlets | New | ? | - | W |
| 255 | Chimeric Leggings | Old | Drop | - | W |
| 255 | Heavy Scorpid Belt | Old | Drop | - | W |
| 255 | Heavy Scorpid Boots | New | ? | - | W |
| 255 | Runic Leather Belt | Old | Drop | - | W |
| 255 | Supple Scorpid Belt | New | ? | - | W |
| 255 | Supple Scorpid Shoulders | New | ? | - | W |
| 255 | Tooled Leather Armor | New | Vendor | - | W |
| 255 | Wicked Leather Headband | Old | Drop | - | W |
| 260 | Scarlet Huntsman's Boots | Old | Drop | - | W; Season of Discovery name |
| 260 | Scarlet Huntsman's Handguards | Old | Drop | - | W; Season of Discovery name |
| 260 | Scarlet Infiltrator's Gloves | Old | Drop | - | W; Season of Discovery name |
| 260 | Scarlet Infiltrator's Shoes | Old | Drop | - | W; Season of Discovery name |
| 260 | Blue Dragonscale Breastplate | Old | Vendor | - | W |
| 260 | Blue Suede Shoulders | New | ? | - | W |
| 260 | Charged Scorpid Vest | New | ? | - | W |
| 260 | Frostsaber Leggings | Old | Drop | - | W |
| 260 | Heavy Scorpid Leggings | Old | Drop | - | W |
| 260 | Living Green Dragonscale Breastplate | Old | Vendor | - | W |
| 260 | Living Leggings | Old | Drop | - | W |
| 260 | Stormshroud Armor | Old | Drop | - | W |
| 260 | Supple Scorpid Helm | New | ? | - | W |
| 260 | Tooled Leather Gauntlets | New | ? | - | W |
| 260 | Volcanic Breastplate | Old | Drop | - | W |
| 260 | Warbear Woolies | Old | Vendor | - | W |
| 260 | Wicked Leather Boots | New | ? | - | W |
| 265 | Black Dragonscale Breastplate | Old | Vendor | - | W |
| 265 | Blue Suede Armor | New | Quest | - | W |
| 265 | Chimeric Vest | Old | Drop | - | W |
| 265 | Dawn Treaders | Old | Vendor | - | W |
| 265 | Devilsaur Gauntlets | Old | Vendor | - | W |
| 265 | Ironfeather Breastplate | Old | Drop | - | W |
| 265 | Might of the Timbermaw | Old | Vendor | - | W |
| 265 | Runic Leather Headband | Old | Vendor | - | W |
| 265 | Tooled Leather Crown | New | ? | - | W |
| 265 | Wicked Leather Pants | Old | Drop | - | W |
| 270 | Wildthorn Mail | Old | Drop | - | W |
| 270 | Scarlet Huntsman's Legguards | Old | Drop | - | W |
| 270 | Scarlet Infiltrator's Trousers | Old | Drop | - | W |
| 270 | Blue Dragonscale Shoulders | Old | Drop | - | W |
| 270 | Blue Suede Belt | New | ? | - | W |
| 270 | Charged Scorpid Leggings | New | ? | - | W |
| 270 | Frostsaber Gloves | Old | Drop | - | W |
| 270 | Living Green Dragonscale Leggings | Old | ? | - | W |
| 270 | Masterwork Volcanic Leggings | Old | Drop | - | W |
| 270 | Stormshroud Shoulders | Old | Drop | - | W |
| 270 | Supple Scorpid Vest | New | Vendor | - | W |
| 270 | Tooled Leather Bracers | New | ? | - | W |
| 270 | Wicked Leather Shoulders | New | ? | - | W |
| 270 | Living Green Dragonscale Gauntlets | Old | ? | - | W |
| 270 | Black Dragonscale Shoulders | Old | Drop | - | W |
| 270 | Heavy Scorpid Helm | Old | Vendor: Zannok Hidepiercer (Wowhead guide) | 8 Rugged Leather, 12 Heavy Scorpid Scale, 1 Cured Rugged Hide, 1 Rune Thread | H |
| 275 | Scarlet Ammo Pouch | Old | ? | - | W |
| 275 | Scarlet Quiver | Old | ? | - | W |
| 275 | Blue Suede Bracers | New | ? | - | W |
| 275 | Runic Leather Pants | Old | Drop | - | W |
| 275 | Tooled Leather Epaulets | New | ? | - | W |
| 275 | Wicked Leather Belt | Old | Drop | - | W |
| 280 | Green Dragonscale Gauntlets | Old | Trainer | - | W |
| 280 | Scarlet Huntsman's Chain | Old | Drop | - | W |
| 280 | Scarlet Huntsman's Coif | Old | Drop | - | W |
| 280 | Scarlet Huntsman's Pauldrons | Old | Drop | - | W |
| 280 | Scarlet Infiltrator's Bandana | Old | Drop | - | W |
| 280 | Scarlet Infiltrator's Shoulderpads | Old | Drop | - | W |
| 280 | Scarlet Infiltrator's Vest | Old | Drop | - | W |
| 280 | Blue Suede Hat | New | ? | - | W |
| 280 | Charged Scorpid Boots | New | ? | - | W |
| 280 | Heavy Scorpid Shoulders | Old | Drop | - | W |
| 280 | Supple Scorpid Sabatons | New | ? | - | W |
| 280 | Tooled Leather Pants | New | ? | - | W |
| 280 | Volcanic Shoulders | Old | Drop | - | W |
| 280 | Wicked Leather Armor | Old | Drop | - | W |
| 285 | Gordok Ogre Suit | Old | ? | - | W |
| 285 | Synthetic Gordok Ogre Suit | Old | ? | - | W |
| 285 | Bileblister Claws | New | ? | - | W |
| 285 | Broodwatcher's Clenchers | New | ? | - | W |
| 285 | Hivethrasher's Claws | New | ? | - | W |
| 285 | Scalegut Clenchers | New | ? | - | W |
| 285 | Honed Blue Dragonscale Breastplate | Old | Vendor | - | W |
| 285 | Masterwork Volcanic Breastplate | Old | Drop | - | W |
| 285 | Runic Leather Armor | Old | Drop | - | W |
| 285 | Runic Leather Shoulders | Old | Drop | - | W |
| 285 | Winter Boots | New | ? | - | W |
| 290 | Heavy Timbermaw Belt | Old | Vendor | - | W |
| 290 | Bileblister Girdle | New | ? | - | W |
| 290 | Broodwatcher's Belt | New | ? | - | W |
| 290 | Hivethrasher's Girdle | New | ? | - | W |
| 290 | Scalegut Belt | New | ? | - | W |
| 290 | Black Dragonscale Leggings | Old | Drop | - | W |
| 290 | Devilcore Gauntlets | Old | Drop | - | W |
| 290 | Devilsaur Leggings | Old | Drop | - | W |
| 290 | Frostsaber Tunic | Old | Drop | - | W |
| 290 | Girdle of Insight | Old | Drop | - | W |
| 290 | Hardened Black Dragonscale Breastplate | Old | Vendor | - | W |
| 290 | Living Breastplate | Old | Drop | - | W |
| 290 | Mongoose Boots | Old | Drop | - | W |
| 290 | Red Dragonscale Breastplate | Old | Drop | - | W |
| 290 | Stormshroud Gloves | Old | Drop | - | W |
| 290 | Swift Flight Bracers | Old | Drop | - | W |
| 295 | Storm Gauntlets | Old | Drop | - | W |
| 295 | Bileblister Boots | New | ? | - | W |
| 295 | Broodwatcher's Treaders | New | ? | - | W |
| 295 | Hivethrasher's Boots | New | ? | - | W |
| 295 | Scalegut Treaders | New | ? | - | W |
| 295 | Corehound Boots | Old | Vendor | - | W |
| 295 | Honed Blue Dragonscale Shoulders | Old | Drop | - | W |
| 295 | Timbermaw Brawlers | Old | Vendor | - | W |
| 300 | Helm of the Great Chief | Old | Drop | - | W |
| 300 | Invulnerable Mail | Old | Drop: Axtroz, Wetlands, 0.02% (wow.gg) | 20 Pristine Leather, 30 Enchanted Leather, 6 Huge Emerald, 6 Azerothian Diamond, 10 Pristine Scale, 2 Rune Thread | REPORTED (wow.gg); skill conflict: 300 (wiki) or 295 (wow.gg); Classic item with new Forever reagents |
| 300 | Sewing Machine | New | Blueprint: Sewing Machine, drop source unknown | 1 Undeath Engine, 5 Rugged Leather, 1 Rune Thread | CONFIRMED; item 279945; colours all 300; camp object |
| 300 | Heavy Timbermaw Boots | Old | Vendor | - | W |
| 300 | Elderwild Pants | New | ? | Fel Leather, rest not found | F |
| 300 | Elderwild Waistcord | New | ? | Fel Leather, rest not found | F |
| 300 | Eternity Pauldrons | New | ? | Fel Leather, rest not found | F |
| 300 | Mourning Handguards | New | ? | Fel Leather, rest not found | F |
| 300 | Outlaw's Collar | New | ? | Fel Leather, rest not found | F |
| 300 | Tranquil Wristguards | New | ? | Fel Leather, rest not found | F |
| 300 | Wild Leather Armor Kit | New | ? | Fel Leather, rest not found | F |
| 300 | Blue Dragonscale Leggings | Old | Trainer | - | W |
| 300 | Golden Mantle of the Dawn | Old | Vendor | - | W |
| 300 | Grimstitch Boots | New | Vendor | Fel Leather, rest not found | F |
| 300 | Grimstitch Gloves | New | Vendor | Fel Leather, rest not found | F |
| 300 | Grimstitch Pants | New | Vendor | Fel Leather, rest not found | F |
| 300 | Grimstitch Spaulders | New | Vendor | Fel Leather, rest not found | F |
| 300 | Grovekeeper Boots | New | Vendor | Fel Leather, rest not found | F |
| 300 | Grovekeeper Gauntlets | New | Vendor | Fel Leather, rest not found | F |
| 300 | Grovekeeper Grips | New | Vendor | Fel Leather, rest not found | F |
| 300 | Grovekeeper Handguards | New | Vendor | Fel Leather, rest not found | F |
| 300 | Grovekeeper Kilt | New | Vendor | Fel Leather, rest not found | F |
| 300 | Grovekeeper Leggings | New | Vendor | Fel Leather, rest not found | F |
| 300 | Grovekeeper Legguards | New | Vendor | Fel Leather, rest not found | F |
| 300 | Grovekeeper Mantle | New | Vendor | Fel Leather, rest not found | F |
| 300 | Grovekeeper Mitts | New | Vendor | Fel Leather, rest not found | F |
| 300 | Grovekeeper Pauldrons | New | Vendor | Fel Leather, rest not found | F |
| 300 | Grovekeeper Sandals | New | Vendor | Fel Leather, rest not found | F |
| 300 | Grovekeeper Shoulderpads | New | Vendor | Fel Leather, rest not found | F |
| 300 | Grovekeeper Spaulders | New | Vendor | Fel Leather, rest not found | F |
| 300 | Grovekeeper Stompers | New | Vendor | Fel Leather, rest not found | F |
| 300 | Grovekeeper Treads | New | Vendor | Fel Leather, rest not found | F |
| 300 | Grovekeeper Trousers | New | Vendor | Fel Leather, rest not found | F |

**Part 3: skill 300 (second half)**

| Skill | Recipe | Old/New | Pattern source | Reagents per craft | Tag; notes |
| --- | --- | --- | --- | --- | --- |
| 300 | Spiritcaller Boots | New | Vendor | Fel Leather, rest not found | F |
| 300 | Spiritcaller Epaulets | New | Vendor | Fel Leather, rest not found | F |
| 300 | Spiritcaller Gauntlets | New | Vendor | Fel Leather, rest not found | F |
| 300 | Spiritcaller Gloves | New | Vendor | Fel Leather, rest not found | F |
| 300 | Spiritcaller Greaves | New | Vendor | Fel Leather, rest not found | F |
| 300 | Spiritcaller Grips | New | Vendor | Fel Leather, rest not found | F |
| 300 | Spiritcaller Kilt | New | Vendor | Fel Leather, rest not found | F |
| 300 | Spiritcaller Leggings | New | Vendor | Fel Leather, rest not found | F |
| 300 | Spiritcaller Mantle | New | Vendor | Fel Leather, rest not found | F |
| 300 | Spiritcaller Pants | New | Vendor | Fel Leather, rest not found | F |
| 300 | Spiritcaller Spaulders | New | Vendor | Fel Leather, rest not found | F |
| 300 | Spiritcaller Treads | New | Vendor | Fel Leather, rest not found | F |
| 300 | Wildstalker's Gauntlets | New | Vendor | Fel Leather, rest not found | F |
| 300 | Wildstalker's Greaves | New | Vendor | Fel Leather, rest not found | F |
| 300 | Wildstalker's Legguards | New | Vendor | Fel Leather, rest not found | F |
| 300 | Wildstalker's Spaulders | New | Vendor | Fel Leather, rest not found | F |
| 300 | Black Dragonscale Boots | Old | Vendor | - | W |
| 300 | Black Dragonscale Helm | New | Trainer (wow.gg); ? (wiki) | 20 Rugged Leather, 40 Black Dragonscale, 12 Enchanted Leather, 4 Cured Rugged Hide, 10 Pristine Scale, 2 Rune Thread, 20 Fel Leather | G |
| 300 | Blood Tiger Breastplate | Old | Vendor | - | W |
| 300 | Blood Tiger Shoulders | Old | Vendor | - | W |
| 300 | Blue Dragonscale Helm | New | Trainer (wow.gg); ? (wiki) | 20 Rugged Leather, 40 Blue Dragonscale, 12 Enchanted Leather, 6 Cured Rugged Hide, 10 Pristine Scale, 2 Rune Thread, 20 Fel Leather | G |
| 300 | Brilliant Chromatic Cloak | Old | Drop | - | W |
| 300 | Chromatic Cloak | Old | Drop | - | W |
| 300 | Chromatic Gauntlets | Old | Vendor | - | W |
| 300 | Core Armor Kit | Old | Drop | - | W |
| 300 | Corehound Belt | Old | Vendor | - | W |
| 300 | Dawn Armor | New | Trainer (wow.gg); ? (wiki) | 6 Enchanted Leather, 10 Guardian Stone, 20 Essence of Water, 10 Pristine Scale, 4 Cured Rugged Hide, 10 Rune Thread, 20 Fel Leather | G |
| 300 | Devilcore Leggings | Old | Drop | - | W |
| 300 | Girdle of Arcane Insight | Old | Drop | - | W |
| 300 | Hardened Black Dragonscale Leggings | Old | Drop | - | W |
| 300 | Hardened Black Dragonscale Shoulders | Old | Drop | - | W |
| 300 | Hide of the Wild | Old | Drop | - | W |
| 300 | Ironfeather Leggings | New | Trainer (wow.gg); ? (wiki) | 20 Rugged Leather, 120 Ironfeather, 4 Jade, 2 Cured Rugged Hide, 4 Rune Thread, 10 Pristine Scale, 20 Fel Leather | G |
| 300 | Lava Belt | Old | Vendor | - | W |
| 300 | Living Crown | New | Trainer (wow.gg); ? (wiki) | 20 Rugged Leather, 20 Living Essence, 20 Essence of Water, 10 Pristine Scale, 4 Cured Rugged Hide, 10 Rune Thread, 20 Fel Leather | G |
| 300 | Mastercrafted Shifting Cloak | Old | Drop | - | W |
| 300 | Masterwork Volcanic Shoulders | Old | Drop | - | W |
| 300 | Molten Belt | Old | Vendor | - | W |
| 300 | Molten Helm | Old | Vendor | - | W |
| 300 | Primal Batskin Bracers | Old | Vendor | - | W |
| 300 | Primal Batskin Gloves | Old | Vendor | - | W |
| 300 | Primal Batskin Jerkin | Old | Vendor | - | W |
| 300 | Pristine Scorpid Leggings | New | Trainer (wow.gg); ? (wiki) | 20 Rugged Leather, 40 Heavy Scorpid Scale, 12 Enchanted Leather, 4 Cured Rugged Hide, 10 Pristine Scale, 2 Rune Thread, 20 Fel Leather | G |
| 300 | Red Dragonscale Leggings | New | Trainer (wow.gg); ? (wiki) | 20 Rugged Leather, 40 Red Dragonscale, 12 Enchanted Leather, 4 Cured Rugged Hide, 10 Pristine Scale, 2 Rune Thread, 20 Fel Leather | G |
| 300 | Shifting Cloak | Old | Drop | - | W |
| 300 | Swift Flight Vambraces | Old | Drop | - | W |
| 300 | Timbermaw Tunic | New | Trainer (wow.gg); ? (wiki) | 6 Enchanted Leather, 20 Powerful Mojo, 20 Living Essence, 10 Pristine Scale, 4 Cured Rugged Hide, 10 Rune Thread, 20 Fel Leather | G |
| 300 | Warbear Helm | New | Trainer (wow.gg); ? (wiki) | 20 Rugged Leather, 20 Warbear Leather, 4 Rune Thread, 2 Cured Rugged Hide, 10 Pristine Scale, 20 Fel Leather | G |

## 4. Disenchanting and Tailoring on a level 1 alt

The level 1 bank alt plan rests on two unconfirmed claims: that a level 1 character can train a crafting profession at all, and that Disenchant has no skill gate. Run tests T4.1 and T4.2 (see In-game tests) before building anything around the alt.

### 4.1 Can a level 1 character learn Enchanting and Tailoring?

**CONFLICT.** Warcraft Tavern (undated, about 10 Nov) and Method.gg (2026-11-11) say crafting professions need character level 5 to train Apprentice, and gathering professions need level 1. WoW-Professions (two undated pages) lists no level requirement. No Blizzard source was found either way. If level 5 is right, the alt must reach level 5 before it can disenchant. Classic Era baseline, not confirmed for Forever: Apprentice crafting can be trained at level 1.

| Rank | Skill range | Skill to train | Character level | Tag |
| --- | --- | --- | --- | --- |
| Apprentice | 1-75 | none | 5 (WT, Method) or none (WoW-Professions) | CONFLICT |
| Journeyman | 75-150 | 50 | 10 | CONFIRMED (4 guides agree, no Blizzard source) |
| Expert | 150-225 | 125 | 20 | CONFIRMED (4 guides agree) |
| Artisan | 225-300 | 200 | 35 | CONFIRMED (4 guides agree); special trainers only |
| New ranks | none listed | - | - | REPORTED, cap 300 (WT) |

Best case for a level 1 alt: Apprentice in both professions, capped at skill 75. Worst case: neither profession until level 5.

Trainers (REPORTED, WoW-Professions; rank labels per NPC disagree with Method.gg, so check the trainer window):

- Zephras Isle: Othesia Evengale (Valanaar) and Taleen Shimmerthread (Shen'dar Village), Apprentice and Journeyman Tailoring.
- Capital Apprentice Tailoring: Lawrence Schneider (Stormwind), Uthrar Threx (Ironforge), Trianna (Darnassus), Snang (Orgrimmar), Vhan (Thunder Bluff), Victor Ward (Undercity).
- Expert: Georgio Bolero (Stormwind), Josef Gregorian (Undercity), Charles Worth (Dalaran). Artisan: Timothy Worthington (Theramore), Daryl Stack (Tarren Mill).
- CONFIRMED (Blizzard hotfix, 2026-11-05): Zephras Isle trade supply vendors now sell apprentice tradeskill bags.

### 4.2 Disenchant skill requirement

**REPORTED, one site, beta-based.** WoW-Professions says you can disenchant every item from Enchanting skill 1, and that Disenchant sits in the Professions window, not the spellbook. Warcraft Tavern only says Disenchant needs Uncommon or better. No Blizzard post, Wowhead Forever page or post-launch report confirms the missing skill gate. None of the 5, 6, 9, 10 or 11 Nov hotfixes mention it. warcraft.wiki.gg's Disenchanting page has no Forever section (last edited 2026-09-30). Classic Era baseline: Disenchant needs a minimum Enchanting skill that rises with item level. For the tool, treat "no skill gate" as a config flag until T4.2 settles it.

### 4.3 Disenchant table

**REPORTED, one source, not Forever-verified, possibly a Classic carry-over** ([WoW-Professions disenchanting guide](https://www.wow-professions.com/forever/disenchanting-guide), undated). The source keys brackets on the tooltip's Requires Level, not item level. That would differ from Classic data keyed on item level, so test it (T4.3).

Uncommon (green) outputs by Requires Level:

| Requires Level | Dust | Essence | Shard or crystal (rare roll) |
| --- | --- | --- | --- |
| 1-10 | 1-2 Strange Dust | 1-2 Lesser Magic Essence | none |
| 11-15 | 2-3 Strange Dust | 1-2 Greater Magic Essence | Small Glimmering Shard |
| 16-20 | 4-6 Strange Dust | 1-2 Lesser Astral Essence | Small Glimmering Shard |
| 21-25 | 1-2 Soul Dust | 1-2 Greater Astral Essence | Large Glimmering Shard |
| 26-30 | 2-5 Soul Dust | 1-2 Lesser Mystic Essence | Small Glowing Shard |
| 31-35 | 1-2 Vision Dust | 1-2 Greater Mystic Essence | Large Glowing Shard |
| 36-40 | 2-5 Vision Dust | 1-2 Lesser Nether Essence | Small Radiant Shard |
| 41-45 | 1-2 Dream Dust | 1-2 Greater Nether Essence | Large Radiant Shard |
| 46-50 | 2-5 Dream Dust | 1-2 Lesser Eternal Essence | Small Brilliant Shard |
| 51-55 | 1-2 Illusion Dust | 1-2 Greater Eternal Essence | Large Brilliant Shard, Nexus Crystal |
| 56-60 | 2-5 Illusion Dust | 1-3 Greater Eternal Essence | Large Brilliant Shard, Nexus Crystal |

Type and quality odds (same source):

| Output | Uncommon armor | Uncommon weapon | Rare | Epic |
| --- | --- | --- | --- | --- |
| Dust | 75% | 20% | - | - |
| Essence | 20% | 75% | - | - |
| Shard | 3-5% | 3-5% | 100% | 100% for epics level 50 and below |
| Nexus Crystal | - | - | about 0.5% | 100% for high-level epics |

Missing from the source: the odds of each quantity (1 vs 2 dust), shard and crystal counts for rares and epics, and the level where "high-level epic" starts. TSM destroy data, Molinari's item data and wago.tools DB2 tables for Forever were not checked; they are the next place to look. Nothing was found on whether the new Mote of Magic comes from disenchanting.

### 4.4 Arcane Salvager

A new Forever Enchanting camp object, placed at a campfire, that "enables more efficient disenchanting" and includes the Enchanted Lute's benefits.

- REPORTED ([wiki](https://warcraft.wiki.gg/wiki/Arcane_Salvager), last edited 2026-11-01, pre-launch): made from Blueprint: Arcane Salvager (drop source unknown); 2 Vision Dust and 1 Lesser Nether Essence; Enchanting 140 (colours 140/140/142/145); needs a Campfire nearby; stacks to 20; all camp features share a 1-hour cooldown; added in 1.60.1.
- CONFIRMED (Blizzard hotfix, 2026-11-10): it now needs the Runed Golden Rod to craft (was Runed Truesilver Rod), and it "now correctly applies its disenchanting bonus to lower-level enchanters".
- UNVERIFIED: the size of the bonus (extra yield or better odds), its radius and duration, and whether a Salvager placed by the main works for the alt. The hotfix wording suggests the bonus applies to whoever disenchants nearby.

A level 1 alt cannot craft it (skill cap 75). Its only route is one the main places, which needs the main at Enchanting 140. Your main is Skinning + Leatherworking, so this would need a third character or a friend. T4.6 tests it.

### 4.5 Cheapest craft-to-disenchant recipes

**Not filled.** No Forever source reached lists reagent quantities together with item quality for cheap green crafts, and rows from memory would break the sourcing rules. What was found:

- REPORTED (Method.gg, 2026-11-11): green Tailoring crafts by skill band, without reagents: Crimson Silk Vest (150-170), Crimson Silk Pantaloons (170-190), Black Mageweave Gloves (190-215). All are above a level 1 alt's cap of 75.
- REPORTED ([wiki Forever tailoring patterns](https://warcraft.wiki.gg/wiki/Forever_tailoring_patterns)): skill and source per pattern, with no quality or reagents. Low-skill trainer patterns include Linen Belt (15) and Simple Linen Boots (20). New sets include Stormsewn (50-60 and 175) and Filigreed gowns and leggings (75-125, drop).
- REPORTED (Warcraft Tavern): cloth by level band: Linen 1-19, Wool 15-30, Silk 26-40, Mageweave 41-50, Runecloth 51-60, Felcloth 50-60 from demons. Some recipes gain spell power variants (Reinforced Woolen Shoulders, Azure Silk Hood).
- CONFIRMED (Blizzard, 2026-11-10): vendor sell prices of some crafted Leatherworking, Tailoring and Blacksmithing armor were reduced (items not named). This shifts the vendor-versus-disenchant comparison.

For the build: generate this table from DB2 data (Section 1 alternatives) by filtering Tailoring and Leatherworking crafts with Uncommon output quality, then price reagents from your own scans.

### 4.6 Tailoring cooldowns

REPORTED (wiki): the Mooncloth pattern exists at skill 230 from a vendor, not marked new. Cooldown length, reagents and location were not found, and no new Tailoring cooldowns were found. Skill 230 needs Artisan, which needs level 35, so a level 1 alt cannot do it. Classic Era baseline: Mooncloth is a cooldown craft made at a moonwell.

### 4.7 Bags after the 11 Nov hotfix

CONFIRMED ([Blizzard hotfix thread](https://us.forums.blizzard.com/en/wow/t/2403040/1), 2026-11-11): five bags were "unintentionally smaller" and now cost one more bolt and hold more. The hotfix gives new slot counts only. Skill and source columns are REPORTED from the wiki.

| Bag | Skill | Pattern source | Bolts before and after | Slots now | Level 1 alt (cap 75)? |
| --- | --- | --- | --- | --- | --- |
| Green Woolen Bag | 75 | Drop | 4 to 5 Bolt of Woolen Cloth | 10 | Yes, at exactly 75 |
| Red Woolen Bag | 90 | Drop | 4 to 5 wool | 10 | No |
| Green Silk Pack | 140 | Drop | 4 to 5 silk | 12 | No |
| Black Silk Pack | 150 | Drop | 5 to 6 silk | 12 | No |
| Red Mageweave Bag | 195 | Trainer | 4 to 5 mageweave | 14 | No |

Other Forever bags (skill and source REPORTED from the wiki; reagents and slots not found unless noted). Forever adds a reagent-bag slot and a reagent bag per cloth tier.

| Bag | Skill | Source | Notes | Level 1 alt? |
| --- | --- | --- | --- | --- |
| Linen Bag | 5 | Trainer | - | Yes |
| Linen Reagent Bag | 5 | Vendor | New, reagent slot | Yes |
| Red Linen Bag | 50 | Drop | 8 slots, was 6 (WT) | Yes |
| Woolen Bag | 50 | Trainer | - | Yes |
| Woolen Reagent Bag | 70 | Vendor | New | Yes |
| Silk Reagent Bag | 125 | Quest | New | No |
| Small Silk Pack | 125 | Trainer | - | No |
| Mageweave Bag, Mageweave Reagent Bag (new), Enchanted Mageweave Pouch | 190 | Trainer, Vendor, Vendor | - | No |
| Runecloth Bag, Runecloth Reagent Bag (new), Soul Pouch | 215 | Vendor | - | No |
| Enchanted Runecloth Bag, Cenarion Herb Bag | 230 | Vendor | - | No |
| Mooncloth Bag (drop), Mooncloth Reagent Bag (new, vendor), Big Bag of Enchantment (drop), Satchel of Cenarius (vendor) | 255 | - | - | No |
| Felcloth Bag | 285 | unknown | - | No |
| Crimson Dawnwoven Bag | 290 | unknown | - | No |
| Bottomless Bag (drop), Bottomless Reagent Bag (new), Core Felcloth Bag (drop), Leather-Reinforced Runecloth Bag (vendor), Felblood Soul Bag (new) | 300 | - | - | No |

No hotfix mentions binding or AH changes for bags. Whether the new reagent bags are bind on pickup is unknown (T4.7).

### 4.8 Enchanting materials, scrolls and other changes

- REPORTED ([timesaver.gg](https://timesaver.gg/blog/wow-forever-enchanting-vellums), 2026-11-01, pre-launch): no vellums or enchant scrolls are live, so enchants cannot be sold on the AH or mailed. Client data holds 177 scroll items (IDs 273458-273635) tagged "PTR Only".
- REPORTED (WoW-Professions, beta-based): Mote of Magic is a new enchanting material. Source and uses not found.
- REPORTED (Warcraft Tavern): Novice's Practice Wand is craftable at Enchanting 1; Lesser and Greater Magic Wands are listed.
- CONFIRMED (Blizzard, 2026-11-10): Lesser Spirit boot and bracer enchants now give Spirit instead of Resist All. Minor Arcane Elixir now sells to vendors for 5c (was 25c).
- No changes to cloth or thread reagents were found beyond the extra bolts on the 11 Nov bags.

### 4.9 Differences from Classic Era

| Area | Forever | Tag |
| --- | --- | --- |
| Disenchant skill gate | Reportedly none | REPORTED |
| Disenchant brackets | Keyed on Requires Level (one source) | REPORTED |
| Disenchant location | Professions window, not spellbook | REPORTED |
| Arcane Salvager | New camp object boosting disenchanting | REPORTED; 10 Nov changes CONFIRMED |
| Camp system | 3 camp objects per profession, shared 1-hour cooldown; Loom and Spinning Wheel needed for some Tailoring recipes | REPORTED |
| Apprentice crafting level | Possibly level 5 | CONFLICT |
| Reagent bag slot and reagent bags | New | REPORTED |
| Bag sizes | Red Linen Bag 8 slots; five bags enlarged 11 Nov | WT REPORTED; 11 Nov CONFIRMED |
| Zephras Isle | New area with Tailoring trainers and bag vendors | trainers REPORTED; vendors CONFIRMED |
| Mote of Magic | New material | REPORTED |
| Enchants on the AH | Still not possible | REPORTED, pre-launch |
| Crafted armor vendor prices | Reduced for some items (10 Nov) | CONFIRMED |
| Tanning Rack | Needs Leatherworking 125, was 140 (6 Nov) | CONFIRMED |

No prices with a date, region and faction were found for this workstream.

## 5. Addon development for Forever

Forever is the "camelot" game type inside the modern Mainline client: interface 16001, client 1.60.1 build 70888, retail-style `C_AuctionHouse` and `C_TradeSkillUI`, and no legacy auction or trade-skill API. Blizzard's automation line is enforced in code, not in the written policy: posting, bidding, buying and cancelling are restricted functions that need a real click or key press. An addon that only reads and advises never touches them. The written Add-On Policy says nothing about companion desktop apps; TSM's and AHledger's apps do exactly what you plan, openly, on Forever.

Main code sources:

- **WUS**: Blizzard's UI source mirror, `forever` branch of [Gethe/wow-ui-source](https://github.com/Gethe/wow-ui-source/tree/4cd0ab752a77164f654ccbca9d0c1fe8dafceebe), commit 4cd0ab7, 2026-11-10, "1.60.1 (70888)". Live client, not beta. Its generated API docs are shared across game types, so a listed function could still be disabled on Forever; the in-game tests settle that.
- **AHL**: AHledger addon and sync app, [DeepCapt/ahledger-sync](https://github.com/DeepCapt/ahledger-sync/tree/a0399e28307a609c1ad7853945730a4bfb75a58c) commit a0399e2, 2026-11-10, addon 0.14.0. Read in full.
- **TSMLX**: [exceptionptr/tsm-app-linux](https://github.com/exceptionptr/tsm-app-linux/tree/1908e34930f742a3a9ce754faf4e1839431fff3a), commit 1908e34, 2026-11-09, a third-party Linux port of the TSM desktop app.

### 5.1 Client facts

| Fact | Value | Tag | Source |
| --- | --- | --- | --- |
| Interface number | `16001` | CONFIRMED | [warcraft.wiki.gg TOC format](https://warcraft.wiki.gg/wiki/TOC_format) (fetched 2026-11-12); [AHledger.toc](https://github.com/DeepCapt/ahledger-sync/blob/a0399e28307a609c1ad7853945730a4bfb75a58c/addon/AHledger/AHledger.toc#L1) `## Interface: 16001, 11509` |
| Client version | 1.60.1, build 70888 | CONFIRMED | WUS version.txt; [wiki Patch 1.60.1](https://warcraft.wiki.gg/wiki/Patch_1.60.1) |
| API base | "the vast majority of APIs available in 12.1.5" | REPORTED, beta-era (wiki note dated 2026-09-15) | [Patch 1.60.1 API notes](https://warcraft.wiki.gg/wiki/Patch_1.60.1/API_changes/notes) |
| Multi-interface TOC line | comma list, e.g. `## Interface: 120105, 16001, 50504, 11509` | CONFIRMED | wiki TOC format; AHledger |
| TOC file names | `MyAddon_Forever.toc` or `MyAddon_Camelot.toc` target Forever; `MyAddon_Mainline.toc` also loads (lower priority) but also loads on retail | CONFIRMED | wiki TOC format; API notes (Forever accepted as a Camelot alias since Beta 4, 2026-10-08) |
| Game type name | `camelot`, e.g. `[AllowLoadGameType camelot]`; wiki says it may be renamed Forever | CONFIRMED | [Blizzard\_ProjectConstants.toc#L7](https://github.com/Gethe/wow-ui-source/blob/4cd0ab752a77164f654ccbca9d0c1fe8dafceebe/Interface/AddOns/Blizzard_ProjectConstants/Blizzard_ProjectConstants.toc#L7) |
| WOW\_PROJECT\_ID | `WOW_PROJECT_CAMELOT = 18`; `WOW_PROJECT_ID = WOW_PROJECT_CAMELOT` (defined only when camelot loads) | REPORTED (one primary source; T5.2) | [Camelot/ProjectConstants.lua#L1-L2](https://github.com/Gethe/wow-ui-source/blob/4cd0ab752a77164f654ccbca9d0c1fe8dafceebe/Interface/AddOns/Blizzard_ProjectConstants/Camelot/ProjectConstants.lua#L1-L2) |
| Other project constants | MAINLINE 1, CLASSIC 2, WOWLABS 3, BCC 5, CATA 14, MISTS 19 | REPORTED | WUS |
| Client folder | `_forever_` (beta used `_classic_beta_`) | CONFIRMED (independent sources) | [CurseForge blog](https://blog.curseforge.com/wow-forever-migrate-addons-beta-to-live/), 2026-10-25; [allthings.how](https://allthings.how/world-of-warcraft-forever-how-to-install-addons-without-the-curseforge-app/), 2026-11-07; TSMLX |
| Product code | `wowf` per ForeverPlusPlus (Section 1); not found in these sources | REPORTED | Section 1 |
| WTF realm folder | named by number, e.g. "93" | REPORTED (TSMLX only) | [accounts.py](https://github.com/exceptionptr/tsm-app-linux/blob/1908e34930f742a3a9ce754faf4e1839431fff3a/tsm/wow/accounts.py) |

Flavor check: use `WOW_PROJECT_CAMELOT ~= nil and WOW_PROJECT_ID == WOW_PROJECT_CAMELOT`, with `select(4, GetBuildInfo()) == 16001` as fallback. AHledger instead treats `GetBuildInfo()` major 1 with minor 16 or higher as Forever ([AHledger.lua#L329-L335](https://github.com/DeepCapt/ahledger-sync/blob/a0399e28307a609c1ad7853945730a4bfb75a58c/addon/AHledger/AHledger.lua#L329-L335)).

### 5.2 Auction house API and scans

Forever runs the modern Blizzard\_AuctionHouseUI with its own category data (`Camelot/Blizzard_AuctionData.lua`, which turns on required-level display and builds Classic-style weapon categories) (CONFIRMED, [Blizzard\_AuctionHouseUI.toc](https://github.com/Gethe/wow-ui-source/blob/4cd0ab752a77164f654ccbca9d0c1fe8dafceebe/Interface/AddOns/Blizzard_AuctionHouseUI/Blizzard_AuctionHouseUI.toc)). `QueryAuctionItems` appears in WUS only inside a doc comment and `GetAuctionItemInfo` not at all. Functions are in `C_AuctionHouse` per [AuctionHouseDocumentation.lua](https://github.com/Gethe/wow-ui-source/blob/4cd0ab752a77164f654ccbca9d0c1fe8dafceebe/Interface/AddOns/Blizzard_APIDocumentationGenerated/AuctionHouseDocumentation.lua); "Restricted" means `HasRestrictions = true`.

| Function | Purpose | Restricted | Availability |
| --- | --- | --- | --- |
| `ReplicateItems()` | Request the whole house listing | No | CONFIRMED (WUS, wiki Forever tag, AHL uses it) |
| `GetNumReplicateItems()` | Row count, index 0 to n-1 | No | CONFIRMED |
| `GetReplicateItemInfo(index)` | name, texture, count, qualityID, usable, level, levelType, minBid, minIncrement, buyoutPrice, bidAmount, highBidder, bidderFullName, owner, ownerFullName, saleStatus, itemID (17th), hasAllInfo (18th) | No | CONFIRMED |
| `GetReplicateItemLink`, `GetReplicateItemTimeLeft`, `GetReplicateItemBattlePetInfo` | Per-row extras | No | in Forever docs |
| `SendBrowseQuery(query)` | Browse; query has searchString, sorts, minLevel, maxLevel, filters, itemClassFilters | No | in docs; AHL uses |
| `GetBrowseResults`, `HasFullBrowseResults`, `RequestMoreBrowseResults` | Read and page browse results (itemKey, appearanceLink, totalQuantity, minPrice, containsOwnerItem) | No | in docs |
| `SendSearchQuery(itemKey, sorts, separateOwnerItems, minLevelFilter, maxLevelFilter)`, `SendSellSearchQuery` | Item or commodity search; doc: "restricted to 100 calls per minute", not for whole-house scans | No | in docs |
| `GetNumCommoditySearchResults` / `GetCommoditySearchResultInfo(itemID, i)`; `GetNumItemSearchResults` / `GetItemSearchResultInfo(itemKey, i)` | Read search results | No | in docs; AHL uses |
| `IsThrottledMessageSystemReady()` | Whether a throttled query may go now | No | in docs |
| `QueryOwnedAuctions(sorts)`, `GetNumOwnedAuctions`, `GetOwnedAuctionInfo(i)`, `HasFullOwnedAuctionResults` | Your auctions: auctionID, itemKey, itemLink, status, quantity, timeLeftSeconds, timeLeft, bidAmount, buyoutAmount, bidder | No | in docs; AHL uses |
| `GetItemKeyFromItem`, `GetItemKeyInfo`, `MakeItemKey` | Item keys | No | in docs |
| `PostItem`, `PostCommodity`, `ConfirmPostItem`, `ConfirmPostCommodity` | Post | **Yes**; wiki: hardware event required and blocked from /run and macros since 9.1.5 | CONFIRMED (docs and wiki Forever tag) |
| `PlaceBid`, `StartCommoditiesPurchase` | Bid and buy | **Yes** | docs |
| `CancelAuction(ownedAuctionID)` | Cancel | **Yes** | docs |
| `ConfirmCommoditiesPurchase` | Confirm a buy | not flagged; follows a restricted call | docs |

Events (all in Forever docs): AUCTION\_HOUSE\_SHOW, AUCTION\_HOUSE\_CLOSED, REPLICATE\_ITEM\_LIST\_UPDATE, AUCTION\_HOUSE\_BROWSE\_RESULTS\_UPDATED and \_ADDED, COMMODITY\_SEARCH\_RESULTS\_UPDATED, \_ADDED and \_RECEIVED, ITEM\_SEARCH\_RESULTS\_UPDATED and \_ADDED, OWNED\_AUCTIONS\_UPDATED, AUCTION\_HOUSE\_THROTTLED\_SYSTEM\_READY, AUCTION\_HOUSE\_THROTTLED\_MESSAGE\_SENT, \_QUEUED, \_RESPONSE\_RECEIVED and \_DROPPED, AUCTION\_HOUSE\_AUCTION\_CREATED, AUCTION\_CANCELED, AUCTION\_HOUSE\_SCRIPT\_DEPRECATED.

Throttles:

- `ReplicateItems`: a 15-minute account-wide cooldown between successful calls. CONFIRMED by the [wiki](https://warcraft.wiki.gg/wiki/API_C_AuctionHouse.ReplicateItems) (Forever-tagged) and AHL's `AUTO_SCAN_MIN_INTERVAL = 15 * 60` ([AHledger.lua#L12-L24](https://github.com/DeepCapt/ahledger-sync/blob/a0399e28307a609c1ad7853945730a4bfb75a58c/addon/AHledger/AHledger.lua#L12-L24)). Section 2's AuxForever claim agrees.
- On Forever (REPORTED, AHL): nothing arrives until the whole listing is ready, then REPLICATE\_ITEM\_LIST\_UPDATE fires once. A refused request fires AUCTION\_HOUSE\_THROTTLED\_MESSAGE\_DROPPED. AHL dropped a 45-second timeout because late listings were lost after the 15-minute allowance was spent, and packing 50k rows in one go froze the client, so it slices the work across frames ([#L445-L465](https://github.com/DeepCapt/ahledger-sync/blob/a0399e28307a609c1ad7853945730a4bfb75a58c/addon/AHledger/AHledger.lua#L445-L465), [#L1098-L1120](https://github.com/DeepCapt/ahledger-sync/blob/a0399e28307a609c1ad7853945730a4bfb75a58c/addon/AHledger/AHledger.lua#L1098-L1120)).
- Retail baseline (wiki): REPLICATE\_ITEM\_LIST\_UPDATE also fires per item as uncached rows load; about 2,000 rows per frame is workable; `owner` is nil except on your own auctions.
- Searches: 100 calls per minute (CONFIRMED, Blizzard doc string).
- A per-player AH action budget per minute aimed at addon-driven rapid scanning, buying and relisting: REPORTED for retail only ([Icy Veins forum](https://icy-veins.com/forums/topic/50161-auction-house-hotfix-to-slow-down-automated-addon-features), undated). No Forever values.
- Whether `ReplicateItems` itself needs a hardware event is not flagged; AHL calls it from a slash command and from AH open.

When any addon (TSM, Auctionator, AHledger) runs `ReplicateItems`, every listener receives the result. AHL deliberately saves "a full listing that arrived without being asked for". Your addon should do the same instead of spending the shared 15-minute cooldown.

### 5.3 Recipes, reagents and cooldowns

Forever uses `C_TradeSkillUI` and the modern Blizzard\_Professions UI; `GetTradeSkillInfo` and `GetNumTradeSkills` appear nowhere in WUS. Recipe data exists only after the profession window has been opened in the session.

| Function or event | Purpose | Availability | Source |
| --- | --- | --- | --- |
| `C_TradeSkillUI.GetAllRecipeIDs()` | All recipe IDs of the open profession; empty until the window has opened | REPORTED: wiki Forever tag and AHL uses it (in pcall), but absent from WUS generated docs | [wiki](https://warcraft.wiki.gg/wiki/API_C_TradeSkillUI.GetAllRecipeIDs); [Crafting.lua#L207-L217](https://github.com/DeepCapt/ahledger-sync/blob/a0399e28307a609c1ad7853945730a4bfb75a58c/addon/AHledger/Crafting.lua#L207-L217) |
| `C_TradeSkillUI.GetFilteredRecipeIDs()` | Filtered list | used by Blizzard UI | WUS |
| `C_TradeSkillUI.GetRecipeInfo(recipeSpellID, recipeLevel)` | Includes `learned`, `recipeID` | Forever docs | [TradeSkillUIDocumentation.lua](https://github.com/Gethe/wow-ui-source/blob/4cd0ab752a77164f654ccbca9d0c1fe8dafceebe/Interface/AddOns/Blizzard_APIDocumentationGenerated/TradeSkillUIDocumentation.lua) |
| `C_TradeSkillUI.GetRecipeSchematic(recipeSpellID, isRecraft, recipeLevel)` | `reagentSlotSchematics[]`, each with `reagents[]` (`itemID`) and `quantityRequired` | Forever docs; AHL uses | [TypesDoc#L214-L293](https://github.com/Gethe/wow-ui-source/blob/4cd0ab752a77164f654ccbca9d0c1fe8dafceebe/Interface/AddOns/Blizzard_APIDocumentationGenerated/TradeSkillUITypesDocumentation.lua#L214-L293) |
| `C_TradeSkillUI.GetRecipeCooldown(recipeID)` | cooldown, isDayCooldown, charges, maxCharges | not in generated docs, but called by the Forever Blizzard UI | [Blizzard\_Professions.lua#L1571](https://github.com/Gethe/wow-ui-source/blob/4cd0ab752a77164f654ccbca9d0c1fe8dafceebe/Interface/AddOns/Blizzard_ProfessionsTemplates/Blizzard_Professions.lua#L1571) |
| `GetBaseProfessionInfo`, `GetChildProfessionInfo`, `GetProfessionInfoBySkillLineID` | Which profession is open, skill | Forever docs | docs |
| `IsTradeSkillReady`, `GetTradeSkillLine` | Readiness | used in WUS | WUS |
| `OpenTradeSkill(skillLineID)`, `CraftRecipe(...)` | Open a profession, craft | not flagged; crafting is an action, not for an advise-only addon | docs |
| TRADE\_SKILL\_SHOW, TRADE\_SKILL\_CLOSE, TRADE\_SKILL\_LIST\_UPDATE, TRADE\_SKILL\_DATA\_SOURCE\_CHANGED, NEW\_RECIPE\_LEARNED, TRADE\_SKILL\_ITEM\_CRAFTED\_RESULT | Events | Forever docs | docs |

Snapshot recipes and cooldowns on TRADE\_SKILL\_LIST\_UPDATE after TRADE\_SKILL\_SHOW and store them in SavedVariables; ask yourself to open each profession once per character after changes. Do not loop `OpenTradeSkill` to harvest data. The Leatherworking recipe gaps in Section 3 can also be filled from your own `GetRecipeSchematic` dump.

### 5.4 Bags, bank, mail and your auctions

| Function or event | Purpose | Availability | Source |
| --- | --- | --- | --- |
| `C_Container.GetContainerNumSlots(bag)` | Slots | Forever docs | [ContainerDocumentation.lua](https://github.com/Gethe/wow-ui-source/blob/4cd0ab752a77164f654ccbca9d0c1fe8dafceebe/Interface/AddOns/Blizzard_APIDocumentationGenerated/ContainerDocumentation.lua) |
| `C_Container.GetContainerItemInfo(bag, slot)` | Table: iconFileID, stackCount, isLocked, quality, isReadable, hasLoot, hyperlink, isFiltered, hasNoValue, itemID, isBound, itemName | Forever docs | docs |
| `C_Container.GetContainerItemID`, `GetBagName` |  | Forever docs | docs |
| `C_Container.UseContainerItem`, `PickupContainerItem` | Actions | AHL: on Forever, hooking `UseContainerItem` is itself blocked at login | [Observe.lua#L692-L694](https://github.com/DeepCapt/ahledger-sync/blob/a0399e28307a609c1ad7853945730a4bfb75a58c/addon/AHledger/Observe.lua#L692-L694) |
| `Enum.BagIndex` | Backpack 0, ReagentBag 5, Keyring -1, Characterbanktab -2, Accountbanktab -3 | WUS | WUS |
| `NUM_BAG_SLOTS`, `NUM_REAGENTBAG_SLOTS`, `NUM_TOTAL_EQUIPPED_BAG_SLOTS` | Bag counts | WUS | WUS |
| BAG\_UPDATE, BAG\_UPDATE\_DELAYED | Bag changes | Forever docs | docs |
| `C_Bank.CanViewBank`, `FetchPurchasedBankTabData`, `FetchPurchasedBankTabIDs`, `FetchNumPurchasedBankTabs`, `FetchDepositedMoney`, `FetchViewableBankTypes` | Bank tabs and money (`PurchaseBankTab` is restricted) | Forever docs | [BankDocumentation.lua](https://github.com/Gethe/wow-ui-source/blob/4cd0ab752a77164f654ccbca9d0c1fe8dafceebe/Interface/AddOns/Blizzard_APIDocumentationGenerated/BankDocumentation.lua) |
| BANKFRAME\_OPENED, BANKFRAME\_CLOSED, BANK\_TABS\_CHANGED |  | Forever docs | docs |
| `GetInboxNumItems()`, `GetInboxHeaderInfo(i)` | packageIcon, stationeryIcon, sender, subject, money, CODAmount, daysLeft, itemCount, wasRead, x, y, canReply, isGM, firstItemQuantity, firstItemLink | Forever MailFrame | [MailFrame.lua#L340](https://github.com/Gethe/wow-ui-source/blob/4cd0ab752a77164f654ccbca9d0c1fe8dafceebe/Interface/AddOns/Blizzard_MailFrame/MailFrame.lua#L340) |
| `GetInboxInvoiceInfo(i)` | invoiceType, itemName, playerName, bid, buyout, deposit, consignment, moneyDelay, etaHour, etaMin, count, commerceAuction | Forever MailFrame; AHL uses | [MailFrame.lua#L790](https://github.com/Gethe/wow-ui-source/blob/4cd0ab752a77164f654ccbca9d0c1fe8dafceebe/Interface/AddOns/Blizzard_MailFrame/MailFrame.lua#L790); [Ledger.lua#L148-L160](https://github.com/DeepCapt/ahledger-sync/blob/a0399e28307a609c1ad7853945730a4bfb75a58c/addon/AHledger/Ledger.lua#L148-L160) |
| `GetInboxItem(i, attachIndex)`, `CheckInbox()` | Attachments, refresh | WUS | WUS |
| `TakeInboxItem`, `TakeInboxMoney`, `AutoLootMailItem` | Looting mail: actions, keep out of an advise-only addon | WUS | WUS |
| `C_Mail.CanCheckInbox`, `HasInboxMoney`, `IsCommandPending` | Helpers | Forever docs | [MailInfoDocumentation.lua](https://github.com/Gethe/wow-ui-source/blob/4cd0ab752a77164f654ccbca9d0c1fe8dafceebe/Interface/AddOns/Blizzard_APIDocumentationGenerated/MailInfoDocumentation.lua) |
| MAIL\_SHOW, MAIL\_INBOX\_UPDATE, MAIL\_CLOSED | Mailbox events | Forever docs; AHL registers | [Mail.lua#L97-L101](https://github.com/DeepCapt/ahledger-sync/blob/a0399e28307a609c1ad7853945730a4bfb75a58c/addon/AHledger/Mail.lua#L97-L101) |

The `consignment` field of the invoice is the AH cut, and `deposit` the deposit: logging these from your sale mails settles Section 2's cut and deposit rules without a separate test. `moneyDelay`, `etaHour` and `etaMin` answer the proceeds-delay question. Whether Forever has an account bank is unverified (T5.12). Mail functions are legacy globals, not in the generated docs; their availability rests on Forever's own MailFrame code.

### 5.5 Secret values and restricted APIs

- REPORTED (wiki, 2026-09-15, beta-era): the Midnight addon-disarmament changes, including secret values, are active in Forever. AHL guards values with `issecretvalue` ([Observe.lua#L45-L51](https://github.com/DeepCapt/ahledger-sync/blob/a0399e28307a609c1ad7853945730a4bfb75a58c/addon/AHledger/Observe.lua#L45-L51)).
- Forever-specific beta-era changes (wiki API notes): a `FrameStrata` secret aspect; GUID server-ID and spawn-ID portions hidden for creatures, vehicles, pets and game objects; trial accounts cannot send addon messages; `SendChatMessage` EMOTE outside instances needs a hardware event; Lua `require` renamed `import`.
- WUS tag counts (2026-11-10): AllowedWhenUntainted 3684, AllowedWhenTainted 176, NotAllowed 92. Secret globals: `issecretvalue`, `issecrettable`, `canaccessvalue`, `canaccesssecrets`, `hasanysecretvalues`.
- Restricted economy functions: the post, bid, buy and cancel calls in 5.2, plus `C_Bank.PurchaseBankTab`.
- When something is blocked, the game names the addon but not the call, so log blocked-action events yourself (AHL, [AHledger.lua#L28-L30](https://github.com/DeepCapt/ahledger-sync/blob/a0399e28307a609c1ad7853945730a4bfb75a58c/addon/AHledger/AHledger.lua#L28-L30)).
- UNVERIFIED interpretation: "AllowedWhenUntainted" probably means secret arguments are accepted only from secure code. Economy data (prices, bags, mail) is not secret in practice; secrets mainly hit combat and unit data. Do not branch on values that might be secret, and prefer events and tooltip hooks over hooking protected functions.

### 5.6 Blizzard's UI Add-On Development Policy and the automation line

The official [UI Add-On Development Policy](https://us.forums.blizzard.com/en/wow/t/ui-add-on-development-policy/24534) is a forum post by Kaivax (staff), created 2018-11-19, never edited, with text dating from 2009 (CONFIRMED, primary). Its clauses, paraphrased:

1. Add-ons must be free: no paid premium versions, download fees or paid services tied to them.
2. Code must be visible: no hiding or obfuscation.
3. Add-ons must not harm realms or other players, at Blizzard's sole discretion (examples: excessive chat, unnecessary disk reads, low frame rates). In its words: "Add-ons must not negatively impact World of Warcraft realms or other players."
4. No advertising of goods or services.
5. No in-game donation requests (allowed on the download page).
6. Content must fit an ESRB "T" rating or equivalent.
7. Add-ons must follow the Terms of Use and EULA.
8. Blizzard may disable any add-on functionality.

The intro says violations can lead to measures up to legal action; enforcement began 2009-05-19 after a 60-day grace period. A 2009-07-15 note covers redistributing game music.

Related: [Prohibitions on Third-party Software](https://us.forums.blizzard.com/en/wow/t/prohibitions-on-third-party-software/2142972) (Kaivax, 2025-08-05) announces cheat detection for software that modifies the client or controls the game in prohibited ways, citing the EULA ban on software that changes or facilitates gameplay "not expressly authorized by Blizzard", with penalties up to permanent closure (CONFIRMED, primary). It does not mention addons, companion apps or SavedVariables. No blue post on auction addons was found (the 2020 "AH Automation" thread has no staff replies). No Forever-specific policy statement was found; the Icy Veins article "Addons in WoW Forever? Blizzard Devs Just Addressed the Big Question" would not load.

Where the line sits for your tool:

- **Automation and hardware events:** not in the policy text. The line is technical: restricted functions need a real key or mouse press and cannot run from scripts. The accepted community line, followed by TSM and Auctionator, is one protected action per click. Your advise-only addon, which never calls them, is well inside it. If you later add a "post this" button, one click must map to one post.
- **Playing the game for you:** covered by clause 7 and the 2025 post. Input simulation or external control of the client is prohibited. Your desktop process must never send input to the game window or read game memory.
- **Charging and obfuscation:** clauses 1 and 2. Moot for a private tool, but keep the Lua readable.
- **Companion apps reading SavedVariables and writing addon data files:** not addressed anywhere. TSM's desktop app (writes AppHelper/AppData.lua) and AHledger's sync app (reads its SavedVariables, writes AHledger\_Data.lua) do this openly on Forever. Touching files on disk between sessions or reloads does not modify the client or automate play, so it sits outside the EULA wording. No explicit Blizzard approval exists either: UNVERIFIED.
- **Clause 3:** keep data files modest. AHL caps scans at 3 per market and 12 in total, about 1 MB each.

### 5.7 How TSM, Auctionator and AHledger build for Forever

**AHledger 0.14.0** (CONFIRMED from source, 2026-11-10):

- One TOC, `AHledger.toc`: `## Interface: 16001, 11509` (Forever and Classic Era), `## SavedVariables: AHledgerDB`, no per-character SavedVariables ([AHledger.toc](https://github.com/DeepCapt/ahledger-sync/blob/a0399e28307a609c1ad7853945730a4bfb75a58c/addon/AHledger/AHledger.toc)).
- Uses `C_AuctionHouse` only. It refuses to scan if `ReplicateItems` is missing and needs the AH frame open ([#L913-L938](https://github.com/DeepCapt/ahledger-sync/blob/a0399e28307a609c1ad7853945730a4bfb75a58c/addon/AHledger/AHledger.lua#L913-L938)). It registers REPLICATE\_ITEM\_LIST\_UPDATE and AUCTION\_HOUSE\_THROTTLED\_MESSAGE\_DROPPED ([#L1286-L1287](https://github.com/DeepCapt/ahledger-sync/blob/a0399e28307a609c1ad7853945730a4bfb75a58c/addon/AHledger/AHledger.lua#L1286-L1287)).
- Throttling: at least 15 minutes between auto scans; frame-sliced packing; scans stored as packed strings in SavedVariables.
- Sales: `GetInboxHeaderInfo` plus `GetInboxInvoiceInfo` ([Ledger.lua#L148-L160](https://github.com/DeepCapt/ahledger-sync/blob/a0399e28307a609c1ad7853945730a4bfb75a58c/addon/AHledger/Ledger.lua#L148-L160)); a mail summary on MAIL\_SHOW, MAIL\_INBOX\_UPDATE and MAIL\_CLOSED ([Mail.lua#L79-L101](https://github.com/DeepCapt/ahledger-sync/blob/a0399e28307a609c1ad7853945730a4bfb75a58c/addon/AHledger/Mail.lua#L79-L101)); `GetOwnedAuctionInfo` for undercut detection ([Ledger.lua#L265-L273](https://github.com/DeepCapt/ahledger-sync/blob/a0399e28307a609c1ad7853945730a4bfb75a58c/addon/AHledger/Ledger.lua#L265-L273)).
- Despite a "no cancelling" header comment, it has a cancel button that calls `CancelAuction` only on your click ([Ledger.lua#L353-L357](https://github.com/DeepCapt/ahledger-sync/blob/a0399e28307a609c1ad7853945730a4bfb75a58c/addon/AHledger/Ledger.lua#L353-L357)), consistent with one action per click.
- Desktop sync (Tauri 2) reads only `WTF/Account/<account>/SavedVariables/AHledger.lua`, uploads with HMAC, and every 30 minutes writes `Interface/AddOns/AHledger/AHledger_Data.lua` ([README](https://github.com/DeepCapt/ahledger-sync/blob/a0399e28307a609c1ad7853945730a4bfb75a58c/README.md)). This is the closest existing model for your design.

**TradeSkillMaster:** closed source, not on GitHub (tried `github.com/TradeSkillMaster/TradeSkillMaster` and `/TSM-AppHelper`). CurseForge (fetched 2026-11-12) lists Retail, MoP Classic, Classic and Classic TBC, latest v4.14.78 (2026-10-14), no Forever. Section 6.4 has the conflicting reports of a 4.15.5 Forever build shipped through the desktop app. TSMLX tests install `_forever_/Interface/AddOns/TradeSkillMaster` at v4.15.0 and an AppHelper-Forever addon, and the TSM backend returns `{"gameType": "forever", "label": "WoW Forever", "folder": "_forever_"}` (REPORTED). TOCs, flavor detection and scan code could not be read.

**Auctionator:** CurseForge lists a Forever flavor, version 12.1.5 released 2026-10-13 (pre-launch); timesaver.gg lists a Forever file 343 dated 2026-11-08 (Section 6.8). The GitHub repo could not be reached. Per ForeverPlusPlus (Section 1), Auctionator has a `Source_Forever` branch that treats browse `minPrice` as a unit price and offers 2, 8 and 24-hour durations (REPORTED). AHL says `ReplicateItems` is "the same call Auctionator and TSM use", which fits, since no legacy API exists, but is not verified from their source. To read both: download the CurseForge zips and grep for `## Interface`, `WOW_PROJECT_CAMELOT` and `ReplicateItems`.

### 5.8 SavedVariables and the desktop data path

- Paths (CONFIRMED pattern from the [wiki](https://warcraft.wiki.gg/wiki/SavedVariables), with `_forever_` from 5.1):
  - Windows account-wide: `C:\Program Files (x86)\World of Warcraft\_forever_\WTF\Account\<ACCOUNT>\SavedVariables\<Addon>.lua` (the usual install location, not from a source; use your own install folder).
  - Windows per character: `...\_forever_\WTF\Account\<ACCOUNT>\<Realm>\<Character>\SavedVariables\<Addon>.lua`, where `<Realm>` may be a number such as 93 (REPORTED, TSMLX).
  - macOS: addons in `/Applications/World of Warcraft/_forever_/Interface/AddOns` (REPORTED, allthings.how); WTF at `/Applications/World of Warcraft/_forever_/WTF/...` by analogy (UNVERIFIED).
- Write timing: the client writes SavedVariables only at logout and `/reload` (CONFIRMED: wiki for logout, AHL for both, [AHledger.lua#L460-L470](https://github.com/DeepCapt/ahledger-sync/blob/a0399e28307a609c1ad7853945730a4bfb75a58c/addon/AHledger/AHledger.lua#L460-L470)). Nothing confirms a write on disconnect or crash.
- TSM AppHelper (REPORTED, TSMLX, mirroring official app 1.0.9): the desktop app atomically rewrites `Interface/AddOns/TradeSkillMaster_AppHelper/AppData.lua` per game folder; the file loads with the addon. Format in Section 6.6.
- For your tool: have the desktop process write a TOC-listed Lua file in your own addon folder (e.g. `MyEcon_Data.lua`), never the SavedVariables file, which the client overwrites at logout and reload. Changes show up after the next `/reload` or login (retail baseline; T5.13).

### 5.9 Minimal Lua snippets

Own code. Every function is cited in 5.2 to 5.4. Unchecked for Forever: the `"seller"` invoice type string, the `itemKey.itemID` field and `C_Timer` (all retail baseline; T5.10 and T5.11 check them).

File: `MyEcon/MyEcon_Forever.toc`

```
## Interface: 16001
## Title: MyEcon
## SavedVariables: MyEconDB
## SavedVariablesPerCharacter: MyEconChar
MyEcon_Data.lua
MyEcon.lua
```

`MyEcon_Data.lua` is the file your desktop process rewrites.

File: `MyEcon/MyEcon.lua`, part 1: events, bags, recipes, mail, owned auctions.

```lua
local f = CreateFrame("Frame")
local function on(e, fn) f:RegisterEvent(e); f[e] = fn end
f:SetScript("OnEvent", function(self, e, ...) self[e](self, ...) end)

on("ADDON_LOADED", function(_, name)
  if name ~= "MyEcon" then return end
  MyEconDB = MyEconDB or {}; MyEconChar = MyEconChar or {}
  MyEconChar.isForever = (WOW_PROJECT_CAMELOT ~= nil and WOW_PROJECT_ID == WOW_PROJECT_CAMELOT)
end)

-- Bags
local function readBags()
  local inv = {}
  for bag = 0, NUM_TOTAL_EQUIPPED_BAG_SLOTS do
    for slot = 1, C_Container.GetContainerNumSlots(bag) do
      local info = C_Container.GetContainerItemInfo(bag, slot)
      if info and info.itemID then inv[info.itemID] = (inv[info.itemID] or 0) + info.stackCount end
    end
  end
  MyEconChar.bags = inv
end
on("BAG_UPDATE_DELAYED", readBags)

-- Recipes, reagents, cooldowns (only after the profession window has opened)
on("TRADE_SKILL_LIST_UPDATE", function()
  local prof = C_TradeSkillUI.GetBaseProfessionInfo()
  local ids = C_TradeSkillUI.GetAllRecipeIDs and C_TradeSkillUI.GetAllRecipeIDs() or {}
  local out = {}
  for _, id in ipairs(ids) do
    local ri = C_TradeSkillUI.GetRecipeInfo(id)
    if ri and ri.learned then
      local s = C_TradeSkillUI.GetRecipeSchematic(id, false)
      local mats = {}
      for _, slot in ipairs(s and s.reagentSlotSchematics or {}) do
        local r = slot.reagents[1]
        if r and r.itemID then mats[r.itemID] = slot.quantityRequired end
      end
      local cd = C_TradeSkillUI.GetRecipeCooldown(id)   -- seconds or nil
      out[id] = { mats = mats, cdEnds = cd and (time() + cd) or nil }
    end
  end
  if prof and prof.professionName then MyEconChar[prof.professionName] = out end
end)

-- Mail and AH invoices
on("MAIL_INBOX_UPDATE", function()
  local sales = {}
  for i = 1, GetInboxNumItems() do
    local _, _, sender, subject, money = GetInboxHeaderInfo(i)
    local invType, itemName, _, _, buyout, deposit, consignment, _, _, _, count = GetInboxInvoiceInfo(i)
    if invType == "seller" then
      sales[#sales+1] = { item = itemName, n = count, gross = buyout, deposit = deposit, cut = consignment, net = money }
    end
  end
  MyEconChar.mailSales = sales
end)

-- Owned auctions (AH must be open)
on("AUCTION_HOUSE_SHOW", function() C_AuctionHouse.QueryOwnedAuctions({}) end)
on("OWNED_AUCTIONS_UPDATED", function()
  local own = {}
  for i = 1, C_AuctionHouse.GetNumOwnedAuctions() do
    local a = C_AuctionHouse.GetOwnedAuctionInfo(i)
    if a then own[#own+1] = { id = a.auctionID, link = a.itemLink, q = a.quantity, buyout = a.buyoutAmount, status = a.status } end
  end
  MyEconChar.owned = own
end)
```

File: `MyEcon/MyEcon.lua`, part 2: a throttle-respecting scan. Nothing here posts, buys or cancels.

```lua
local FULL_SCAN_GAP = 15 * 60          -- ReplicateItems account-wide cooldown
local queue, waiting = {}, false

-- Full scan: AH open, at most every 15 min, started from your own button or slash command
function MyEcon_FullScan()
  if not AuctionHouseFrame or not AuctionHouseFrame:IsShown() then return end
  if time() - (MyEconDB.lastFull or 0) < FULL_SCAN_GAP then return end
  waiting = true; C_AuctionHouse.ReplicateItems()
end

-- Also accepts a full listing another addon requested
on("REPLICATE_ITEM_LIST_UPDATE", function()
  waiting = false; MyEconDB.lastFull = time()
  local n, rows, i = C_AuctionHouse.GetNumReplicateItems(), {}, 0
  local ticker; ticker = C_Timer.NewTicker(0, function()   -- frame-sliced, about 2,000 rows per frame
    local stop = math.min(i + 2000, n)
    for k = i, stop - 1 do
      local _, _, count, _, _, _, _, _, _, buyout, _, _, _, _, _, _, itemID = C_AuctionHouse.GetReplicateItemInfo(k)
      if itemID and buyout and buyout > 0 then rows[#rows+1] = itemID .. ":" .. count .. ":" .. buyout end
    end
    i = stop
    if i >= n then ticker:Cancel(); MyEconDB.scan = { t = time(), rows = table.concat(rows, ";") } end
  end)
end)
on("AUCTION_HOUSE_THROTTLED_MESSAGE_DROPPED", function() waiting = false end)

-- Targeted browse searches: one in flight, only when the throttle system is ready (under 100/min)
local busy = false
local function pump()
  if busy or #queue == 0 or not C_AuctionHouse.IsThrottledMessageSystemReady() then return end
  busy = true
  C_AuctionHouse.SendBrowseQuery({ searchString = table.remove(queue, 1), sorts = {}, filters = {} })
end
on("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED", function()
  MyEconDB.min = MyEconDB.min or {}
  for _, r in ipairs(C_AuctionHouse.GetBrowseResults()) do MyEconDB.min[r.itemKey.itemID] = r.minPrice end
  busy = false; C_Timer.After(1, pump)
end)
on("AUCTION_HOUSE_THROTTLED_SYSTEM_READY", pump)
function MyEcon_QueueSearch(name) queue[#queue+1] = name; pump() end
```

Note: REPLICATE\_ITEM\_LIST\_UPDATE may also fire per item as uncached rows load (retail baseline). If it does on Forever, debounce the handler so one listing is packed once.

### 5.10 Conflicts

| Conflict | Side A | Side B | Settle with |
| --- | --- | --- | --- |
| Client folder | `_forever_` (CurseForge blog, allthings.how, TSMLX) | AHledger README says `_classic_` | Likely stale README; check which folder has fresh `WTF/Account` timestamps |
| `GetAllRecipeIDs` on Forever | Wiki Forever tag; AHL uses it | Absent from WUS generated docs | T5.8 |
| Game type name | Wiki: "forever" is an alias of "camelot" and may replace it | Blizzard code uses only camelot | T5.2 |
| TSM on Forever | CurseForge: no Forever flavor, 4.14.78 | TSMLX fixtures (4.15.0), two sites (4.15.5) | Read the installed TOC (T6.1) |
| AHledger "no cancelling" | Header comment | Click-to-cancel button | Resolved: user click only |

## 6. Third-party price data

AHledger is the best external feed for an EU tool: documented, covers EU markets, free for personal use with a credit line, with terms that tighten on 2026-12-10. No documented TSM web API for Forever was found. auctionhouse.fyi is keyless but its spec lists US markets only. ForeverDB has game data but no prices. No API here was called live (the research sandbox's proxy blocked the hosts), so every endpoint and field below comes from each service's own docs or spec.

### 6.1 Comparison

| Service | Forever coverage | Freshness | Cost | Use in a private tool | Tag |
| --- | --- | --- | --- | --- | --- |
| AHledger | 24 markets: normal, pvp, rp, rppvp x Alliance, Horde x US, EU, CN | per scan; prices cached 1 min | free key; commercial $29 to $499+ per month | free for personal use, credit "Prices from AHledger"; cache and history limits from 2026-12-10 | REPORTED (own docs) |
| auctionhouse.fyi | 6 US markets in spec (normal, pvp, rp x 2 factions); no EU | hourly | free reads | terms page unreachable | REPORTED (own spec, "PREVIEW") |
| TSM public CSV | not stated; only Retail examples | realm files every few hours, region daily | free, no key | no terms found; ToS not read | REPORTED, beta-era doc |
| TSM desktop backend | "Forever" game version present | websocket push | TSM account | TSM's own client API; no third-party grant | REPORTED (community code) |
| ForeverDB | game data only, no prices | per build | free with approval | credit link, no resale | REPORTED (own docs) |
| timesaver.gg | 40 materials, US and EU | hourly | free CSV | ToS not read | REPORTED |

### 6.2 AHledger

All REPORTED from its own pages: [developers](https://ahledger.com/developers) (undated, newest content 2026-11-10) and [open data](https://ahledger.com/data) (newest scan 2026-11-12).

- Base `https://api.ahledger.com`, all GET. Free key from the account page, sent as `Authorization: Bearer ahlk_...` or `x-ahl-api-key`. Keyless calls are allowed.
- Market ID: `forever.<ruleset>.<faction>.<region>`, e.g. `forever.normal.horde.eu`. Rulesets `normal`, `pvp`, `rp`, `rppvp`. Markets without a scanner return a null `latest` and an empty series.
- Data comes from players' addon scans plus Blizzard game data. Catalog build 1.60.1 (70888), imported 2026-11-10. An AHledger addon exists on CurseForge.

| Endpoint | Parameters | Returns | Cache |
| --- | --- | --- | --- |
| `/v1/markets` | none | id, game, ruleset, faction, region, label | 5 min |
| `/v1/items/{itemId}` | `game=forever` | name, quality, class, level, requirement, vendor value, icon | 5 min |
| `/v1/prices/{market}/{itemId}` | `range` = 24h, 7d, 30d or 90d | `market`, `item`, `latest`, `range`, `series`, `sales.estimatedPerDay` | 1 min |
| `/v1/pricetable/{market}` | none | plain-text table for the addon; ETag and 304 | 1 min |
| `/v1/tooltip/{market}` | `items=` up to 100 IDs | latest, 7 and 30-day medians, `salesPerDay` | 1 min |
| `/v1/deals/{market}` | `discount`, `units`, `sells`, `sort`, `limit` up to 200, `format=csv` | listings below the 30-day median | 10 min |
| `/v1/crafting/{market}` | `profession`, `all=1`, `format=csv` | recipes by margin, `resultSalesPerDay`, `profitPerDay` | 15 min |
| `/v1/disenchant/{market}`, `/v1/structure/{market}`, `/v1/timing/{market}/{itemId}`, `/v1/signals/{market}` | see docs | market analytics | 10-15 min |
| `/v1/economy`, `/v1/economy/{market}` | none | economy totals with daily history | 10 min |
| `/health` | none | status | 10 s |

Fields: `latest` holds `observedAt`, `source`, `minBuyout`, `median`, `quantity`, `auctions`, `median7d`, `median30d`, `median90d`. A series point holds `t`, `min`, `median`, `p25`, `p75`, `quantity`, `auctions`. Market-tool responses add `marketStatus`, `pricesAsOf` and `generatedAt`. Format sample from the docs (item and market not stated):

```json
"latest": { "observedAt": "2026-11-05T14:02:11.000Z", "source": "Addon scan",
  "minBuyout": 18, "median": 20, "quantity": 3420, "auctions": 212 }
```

Price table format: header `AHL1|<market>|<unix time>|<row count>`, then one row per item: `itemId:median:minBuyout:quantity:median7d:median30d:low30d:high30d:soldPerDay*10`.

History: 24h has one point per full scan, 7d hourly buckets, 30d and 90d daily buckets. Raw scans are archived daily.

Limits and terms:

| Item | Now | From 2026-12-10 |
| --- | --- | --- |
| Rate limit | 300 requests per minute per address, key or not | 30/min keyless; 300/min free key (per account, IPv6 per /64); commercial 600+ |
| Price table downloads | not stated | 60 full downloads per hour per market, non-commercial (304s not counted) |
| History access | all ranges | keyless 24h and 7d; free key adds 30d; commercial adds 90d and bulk export |
| Keeping data | not restricted | no keeping responses past their `Cache-Control` lifetime |
| Credit | a link to ahledger.com | "Prices from AHledger" linked to the matching page (`attribution.url`) |

Commercial licences: Site $29 per month ($290 per year, 600 requests/min, full history); Product $99 per month (1,200/min); Data from $499 per month (keep past cache, archives, bulk). Errors are 429 or 503 with `Retry-After`. Do not present the data as your own scans or resell it as a feed.

The 2026-12-10 rule against keeping data past cache time matters for your design: your own hourly history should come from your own collector or scans, with AHledger used live for current prices and sale rates. If you want to keep AHledger history, that is the Data licence.

Minimal requests (written from the docs, not run):

```bash
curl -s -H "Authorization: Bearer $AHL_KEY" https://api.ahledger.com/v1/markets
curl -s -H "Authorization: Bearer $AHL_KEY" "https://api.ahledger.com/v1/prices/forever.normal.horde.eu/<itemId>?range=7d"
curl -s -H "Authorization: Bearer $AHL_KEY" "https://api.ahledger.com/v1/tooltip/forever.normal.horde.eu?items=<id1>,<id2>"
```

### 6.3 auctionhouse.fyi

REPORTED from its [OpenAPI spec](https://auctionhouse.fyi/openapi.json) 1.0.0 and [API docs](https://auctionhouse.fyi/docs/api) (undated, marked "PREVIEW"). Forever only. Base `https://auctionhouse.fyi/api/v1`, JSON, timestamps in Unix ms, prices in integer copper per item. Public reads need no key; API keys need the `api.read` scope. Reads are hourly, not live, and volume is an estimate. Prices come from player scans via its free addon and desktop app, without seller names.

| Endpoint | Returns |
| --- | --- |
| `GET /ah` | `markets[]` with `market`, `at`, `items`, `listed`, `scans`, `contributors7d`, `book`; `now`, `live` |
| `GET /ah/{market}/{item}` | `row` = \[unit copper or null, quantity, observedAtMs\]; `days` = \[\[UTC epoch day, low, last, quantity\]\]; `volume` |
| `GET /ah/{market}/{item}/candles?res=d1, h1 or m1&from=<ms>` | `candles` = \[\[bucket, open, high, low, close, quantity\]\] |
| `GET /items/{key}` | build, item name, quality, icon, variant |
| `GET /atlas`, `/atlas/search`, `/atlas/locations` | maps, places, quests, acquisitions (ETag) |
| `POST /ah/books` | scan upload; needs a device token or upload-scope key; 200,000 entries per array, 32 MiB |

The spec's market list holds only `forever.{normal,pvp,rp}.{alliance,horde}.us`. Rate limiting is 429 with `Retry-After`, with no quota stated. The terms page could not be fetched. For an EU tool this is a fallback at best until EU markets appear.

### 6.4 TradeSkillMaster

**Web API.** TSM's current support article (updated 2026-07-05, beta-era) describes only static, keyless CSV files at `public-data.tradeskillmaster.com`, with "no API key, sign-in, or rate limits". Path template: `/{gameType}/{regionSlug}/realm/{realmSlug}/items.csv`, plus `/{gameType}/{regionSlug}/region/items.csv` and Retail-only commodities. Realm files change every few hours, region files daily. Forever is not mentioned, the Forever `gameType` slug is unknown, the column list did not render, and the host root failed to load. The older authenticated pricing-api and auth hosts are no longer described. REPORTED.

**Desktop-app backend.** REPORTED from one community re-implementation of the desktop app ([exceptionptr/tsm-app-linux](https://github.com/exceptionptr/tsm-app-linux), commit 2026-11-09, payload shapes "verified live 2026-11-08"):

- Login is Keycloak OIDC at `id.tradeskillmaster.com` with `client_id=desktop-app`; the token carries a premium tier claim.
- `realm-api.tradeskillmaster.com/v2/regions` lists `gameVersion` "Forever"; `/v2/realms` gives `auctionHouses[]` with type All, Alliance or Horde.
- `desktop-backend.tradeskillmaster.com/game-versions` returns gameType `forever` and folder `_forever_`.
- Price data is pushed over a socket.io websocket as presigned download links.
- Forever region key `Forever-EU`; data keyed by ruleset ("Normal") plus faction, e.g. scope "Horde - Normal". The WTF realm folder for Forever is named "93" in one test.
- No real Forever region, realm or auction house IDs were found; the repo's test IDs are invented.

This is TSM's own client interface. Logging in as `desktop-app` from your tool is not a sanctioned third-party use, so do not build on it. Reading the files the official app writes to your disk is a different matter (6.6).

**Addon version: CONFLICT.** mmonster.co (updated 2026-11-10) and timesaver.gg (2026-11-09) both report a TSM Forever build v4.15.5 from Nov 9 (4.15.2 on Nov 5, 4.15.3 on Nov 6). CurseForge's TSM page shows v4.14.78 (2026-10-14) and no Forever flavour. The Forever build seems to ship through the desktop app's updater. Settle it by reading `## Version` in the installed TOC (T6.1).

### 6.5 TSM in-game API and price sources

Not verified for 4.15 or Forever: no 4.15 source or TSM\_API documentation could be read. TSM's price source list (updated 2024-11-19) is a retail and Classic baseline: `DBMinBuyout`, `DBMarket` (14-day weighted toward the last 3 days), `DBRecent`, `DBHistorical` (60-day average of DBMarket), `DBRegionMarketAvg`, `DBRegionHistorical`, `DBRegionSaleAvg`, `Crafting`, `matPrice`, `Destroy`, `vendorBuy`, `vendorSell`, `avgBuy`, `avgSell`, `maxBuy`, `maxSell`, `minBuy`, `minSell`, `SmartAvgBuy`, `AuctioningOpMax`/`Min`/`Normal`, `ShoppingOpMax`, `SniperOpMax`. `DBRegionSaleRate` and `DBRegionSoldPerDay` are not in that list. The socket tag `AUCTIONDB_REGION_SALE` suggests sale stats exist in some form. External sources TSM accepts include Auctionator's `AtrValue`. Check the real list in game with T6.2.

### 6.6 AppData.lua and Accounting formats

Both REPORTED from the same community code only; no official TSM description exists. Treat the code as a map for reading the files, and confirm against your own files (T6.3, T6.4).

**AppData.lua** (`_forever_/Interface/AddOns/TradeSkillMaster_AppHelper/AppData.lua`): one line per tag and realm or region key. Each is a `LoadData` call wrapping a `return {...}` blob, then a comment with tag, key, unix time and an optional auction house ID. Connected realms that share a house are folded into one `ipairs` line, newest entries first. Format, with placeholder values:

```lua
select(2, ...).LoadData("AUCTIONDB_NON_COMMODITY_DATA","<Key>",[[return {downloadTime=<unix>,fields={...},data={...}}]]) --<AUCTIONDB_NON_COMMODITY_DATA,<Key>,<unix>,<ahId>>
```

- Keys: a realm or `<Realm>-Horde`, a region such as `Forever-EU`, or `Global` for `APP_INFO`.
- Tags seen on 2026-11-08: `APP_INFO`, `AUCTIONDB_NON_COMMODITY_DATA`, `_HISTORICAL`, `_SCAN_STAT`, the `AUCTIONDB_COMMODITY_*` set (retail), `AUCTIONDB_REGION_STAT`, `AUCTIONDB_REGION_SALE`, `AUCTIONDB_REGION_HISTORICAL`. Which arrive for Forever is not stated; a test expects `AUCTIONDB_REGION_STAT` under `Forever-EU`.
- The `fields` list is defined by the server per blob, so parse column positions from it rather than hard-coding them.
- Desktop app 1.0.9 added the 4-field comment and the `ipairs` grouping; the older app wrote 3 fields.

**Accounting** (`_forever_/WTF/Account/<account>/SavedVariables/TradeSkillMaster.lua`, table `TradeSkillMasterDB`):

- Flat keys `"r@<Realm>@internalData@csvSales"`, plus `csvBuys`, `csvIncome`, `csvExpense`, `csvExpired`, `csvCancelled`. Each value is a CSV string with `\n` escapes; the first line is the header.
- Gold log: `"s@<char> - <faction> - <realm>@internalData@goldLog"`, columns `minute,copper`, where minute is unix time divided by 60.
- Faction-realm scopes are listed under `_scopeKeys.factionrealm`; on Forever they look like `"Horde - Normal"`.
- Column order is unconfirmed; the community parser matches header names like `time`, `price`, `quantity`, `itemString`, `player`.

Your tool can parse AHledger's own data in its addon the same way, and your own addon's SavedVariables give you sales data without depending on TSM's format at all.

### 6.7 ForeverDB

REPORTED ([developers page](https://foreverdb.net/developers), fetched 2026-11-12). Game data only: no price endpoints. Useful for items, vendor prices, disenchant data and professions.

- `GET /api/v1/` endpoints: `meta`, `items`, `spells`, `quests`, `vendors`, `poisons`, `disenchant`, `dungeons`, `zones`, `classes`, `itemsets`, `professions`, `professions/{slug}`, `gathering/{slug}`, `battlegrounds`, `changes-seen`, `builds`, `buffs-nerfs`, `merchants-favor`, `articles`, `posts` (most also have `/{id}`).
- Paging `limit` 1-100 (default 25) and `offset`; filters `q`, `zone`, `class`, `quality`, `minLevel`, `maxLevel`, `type`, `kind`, `new`, `changed`, `verified`, `seen`.
- Auth: an account plus approval (Battle.net login and a project description), up to 3 keys, `X-API-Key` or Bearer, and a descriptive User-Agent.
- Response `{data, meta}`; `meta` carries the game build. Some records flag beta or speculative data, and some fields are marked Classic data versus seen in Forever: useful for this report's sourcing rules.
- Limits 60 requests/min and 10,000/day per key. Terms: visible credit link, no resale, not affiliated with Blizzard.

Its `disenchant`, `professions` and `merchants-favor` endpoints are candidates for filling the gaps in Sections 3 and 4.

### 6.8 Other sources

- timesaver.gg ([auction prices](https://timesaver.gg/wow-forever/auction-prices)): 40 crafting materials, US and EU, hourly, region medians plus per-faction medians, log since 2026-11-08, CSV at `timesaver.gg/wow-forever/auction-prices.csv`, no API. It says its data comes from Blizzard's Game Data API, "not officially documented for WoW Forever". REPORTED.
- Example region medians, both factions combined, scans 2026-11-11 21:25 UTC (EU) and 21:22 UTC (US). Examples only:

| Item | EU | US |
| --- | --- | --- |
| Thorium Bar | 19s 54c | 35s |
| Felcloth | 64s 66c | 89s |
| Rugged Leather | 12s | 10s 55c |

- Also seen: Auctionator Forever file 343 (2026-11-08) and a "CraftProfit Forever" addon on CurseForge (not fetched).

### 6.9 Conflicts

1. **Does Forever have a Blizzard auction API?** auctionhouse.fyi says no (prices come only from player scans); timesaver.gg says it uses the Game Data API; AHledger cites addon scans. Section 1 is the deciding evidence. Also compare a timesaver.gg EU median with AHledger's at the same hour.
2. **TSM addon version:** v4.15.5 (two third-party sites) versus v4.14.78 with no Forever (CurseForge). Read the installed TOC.
3. **TSM web API:** the old authenticated pricing API versus keyless CSV only. Try the CSV path with slug `forever` (T6.5); a 404 means the slug is wrong or Forever is not served.
4. **auctionhouse.fyi EU coverage:** the spec lists US only. Check `/api/v1/ah` for `.eu` IDs.
5. **TSM granularity:** ruleset plus faction, per the community code. Check `_scopeKeys.factionrealm` and the AppData keys.

## In-game tests

Run these five first: they decide the shape of the build. T4.1 (can a level 1 alt train Enchanting at all), T4.2 (Disenchant skill gate), T1.6 (does the ruleset filter auction data), T1.3 (EU house ID to faction map) and T2.1 (deposit formula). Every test below lists what to record; note date, time, region, ruleset and faction on each result. Tests marked API run from your own machine with your Battle.net API credentials, not in game.

### Workstream 1: Game Data API (API, EU)

Set up once:

```bash
TOKEN=$(curl -s -u "$CLIENT_ID:$CLIENT_SECRET" -d grant_type=client_credentials https://oauth.battle.net/token | jq -r .access_token)
H="Authorization: Bearer $TOKEN"; B=https://eu.api.blizzard.com
```

- **T1.1 Token.** The command above returns a token. Record `expires_in` from the raw JSON.
- **T1.2 Rulesets.** Expect 1, 2, 3 and 15:

```bash
curl -s -H "$H" "$B/data/wow/ruleset/index?namespace=dynamic-forever-eu&locale=en_GB" | jq '.rulesets[].id'
```

- **T1.3 EU house IDs and the trailing slash.** The first call prints each house ID and name; the second should print 404.

```bash
curl -s -H "$H" "$B/data/wow/ruleset/2/auctions/?namespace=dynamic-forever-eu&locale=en_GB" | jq -r '.auctions[] | "\(.id) \(.name)"'
curl -s -o /dev/null -w "%{http_code}\n" -H "$H" "$B/data/wow/ruleset/2/auctions?namespace=dynamic-forever-eu&locale=en_GB"
```

- **T1.4 Headers, gzip, conditional GET.** Record last-modified, etag, cache-control, content-encoding and content-length. Paste the last-modified value into LM; the second call returns 304 if supported.

```bash
curl -s -D - -o h113.gz -H "$H" -H "Accept-Encoding: gzip" "$B/data/wow/ruleset/2/auctions/113?namespace=dynamic-forever-eu&locale=en_GB" \
  | grep -iE "^(HTTP|last-modified|etag|cache-control|content-encoding|content-length)"
LM="<paste last-modified>"
curl -s -o /dev/null -w "%{http_code}\n" -H "$H" -H "If-Modified-Since: $LM" "$B/data/wow/ruleset/2/auctions/113?namespace=dynamic-forever-eu&locale=en_GB"
```

- **T1.5 buyout per stack or per unit.** List item auctions with quantity above 1, then find one of them in game and compare the shown price with `buyout`.

```bash
(gunzip -c h113.gz 2>/dev/null || cat h113.gz) | jq '[.auctions[] | select(.quantity>1 and .buyout!=null)] | .[0:5]'
```

- **T1.6 Does the ruleset filter anything?** Same count and first IDs for both means it filters nothing. Then in game: post one unusual cheap item on your ruleset, note the time, and after the next snapshot find its item ID in each house to see which house ID your in-game auction house is.

```bash
for r in 1 2; do curl -s -H "$H" "$B/data/wow/ruleset/$r/auctions/113?namespace=dynamic-forever-eu" | jq '[.auctions[].id] | sort | (length, .[0:3])'; done
```

- **T1.7 Refresh interval.** Log Last-Modified every 5 minutes for 24 hours and read off the cadence and the minute it lands on:

```bash
while true; do date -u +%FT%TZ; curl -s -D - -o /dev/null -H "$H" "$B/data/wow/ruleset/2/auctions/113/commodities?namespace=dynamic-forever-eu" | grep -i last-modified; sleep 300; done
```

- **T1.8 Item coverage.** Item 720 on Forever versus retail static:

```bash
for ns in static-forever-eu static-eu; do curl -s -o /dev/null -w "$ns %{http_code}\n" -H "$H" "$B/data/wow/item/720?namespace=$ns&locale=en_GB"; done
```

### Workstream 2: Auction house and mail

- **T2.1 Deposit formula.** Pick an item with a known vendor sell price V (from the vendor tooltip). At your faction auction house, for quantities 1, 5 and 20 and each duration offered, set a buyout and read the deposit shown before posting; you do not need to post. Record item, V, quantity, duration, deposit and the duration options in the dropdown. Repeat with a zero-vendor item such as a dust. Repeat everything after the 2026-11-17 maintenance to see whether the floor is now 1 copper.
- **T2.2 Cut.** Sell one item for a round price, e.g. 10g, at a faction house and one at the neutral house. From each sale mail record sale price, deposit returned, cut and net. Cut % = cut / sale price. The addon in 5.9 logs `consignment` and `deposit` automatically, so every sale becomes a data point.
- **T2.3 Partial commodity fill.** Post 20 units of a stackable, wait for a partial sale, and record each sale mail (quantity, gross, cut, deposit portion returned) and what remains listed.
- **T2.4 Mail.** Send gold and one item from character A to your own character B (same faction) and to a friend. Record postage, the maximum attachments the window allows, and send-to-arrival time. Try your opposite-faction character on the same account and record the error. Record the time from an AH sale to the proceeds mail (or read `moneyDelay`, `etaHour`, `etaMin` from the invoice). Send a COD mail and note the days-left value shown.
- **T2.5 Limits.** Try posting at 1 copper and at a very high price, and keep posting cheap items to see if a listing cap appears. Record any error text.
- **T2.6 Throttle.** Post or cancel several cheap items quickly by hand; record any error message and how many actions it took to appear.

### Workstream 3: Skinning and Leatherworking

- **T3.1 Recipe dump.** Open your Leatherworking window with the 5.9 addon installed (or `/dump C_TradeSkillUI.GetRecipeSchematic(<recipeID>, false)` per recipe), and at the trainer turn on unavailable recipes. Record every recipe's name, required skill, cost and reagents. Repeat at 225 and 300. This fills most of the reagent gaps in 3.10.
- **T3.2 Salt Shaker.** Get a Salt Shaker (Engineering craft or AH). Hover it and record the cooldown text. Use it on Deeprock Salt and record how much Refined Deeprock Salt you get and the remaining cooldown. Then craft Cured Rugged Hide and confirm 1 Rugged Hide + 1 Refined Deeprock Salt and no cooldown of its own.
- **T3.3 Workstation gating.** With no Tanning Rack placed, open Leatherworking and note which recipes show "Requires Tanning Rack" or "Requires Sewing Machine". Place a Campfire and the Rack (skill 125) and check again. Record the shared 1-hour cooldown timer.
- **T3.4 Merchant's Favor vendors.** Visit Daniel Stitchsong (Redridge) or Pawani (Barrens), and Nina Surefire or Apothecary Durelle. Record every Leatherworking pattern with its MF price, reputation requirement and limited stock.
- **T3.5 Crate value.** Turn in one Textiles crate filled with 20 Light Leather, then one Artisan crate (20 Thick or Rugged). Record MF and reputation gained for each, so you can work out gold per MF.
- **T3.6 Pristine drop rates.** Skin 200 beasts in each band: 12-18 (Barrens), 30-40, and 50-60 (Un'Goro). Log Pristine Leather, Hide, Scale and Fel drops, with and without Bountiful Harvest, and note your character level.
- **T3.7 Bind check.** Craft one Pristine-set item (e.g. Defender's Leather Belt) and check bind on equip versus bind on pickup.
- **T3.8 Specialization.** At 225 and level 40, talk to Peter Galen (Alliance, Azshara) or Thorkaf Dragoneye (Horde, Badlands) and confirm the Dragonscale quest. Ask the Elemental and Tribal trainers about their quests and any unlearn cost. Check whether the 300 Pristine Scale recipes say "Requires Dragonscale, Tribal or Elemental Leatherworking".

### Workstream 4: Disenchanting and Tailoring

- **T4.1 Level gate.** Make a fresh level 1 character and try to train Apprentice Enchanting and Apprentice Tailoring (capital trainer or Zephras Isle). One attempt each settles it. Record the exact error text if it fails, and the trainer name.
- **T4.2 Disenchant skill gate.** With Enchanting at 1-10, disenchant one green each with Requires Level about 15, 35 and 55. Success at 55 means there is no gate; otherwise record the "requires Enchanting (N)" text.
- **T4.3 Bracket key.** Find greens either side of a bracket edge (e.g. Requires Level 20 versus 21) with differing item levels, or the reverse. Disenchant at least 20 of each and compare which dust tier drops.
- **T4.4 Armor and weapon odds.** In one bracket, disenchant at least 100 green armor pieces and 100 green weapons, logging dust, essence and shard counts. At n = 100 the 95% margin on a 75% rate is about plus or minus 8.5 points and on a 4% shard rate about plus or minus 4 points: enough to tell 75/20/5 from other splits. Use 300 or more to pin down the shard rate.
- **T4.5 Quantity spread.** From the same logs, count how often each quantity drops (e.g. 1 versus 2 Vision Dust) per bracket.
- **T4.6 Arcane Salvager.** Needs a character with Enchanting 140 to place one at a campfire. Have the alt disenchant at least 100 same-bracket greens next to it and 100 without it. Compare average dust and essence per item and the shard rate, and check for a buff icon and its tooltip on the alt.
- **T4.7 Bags.** On the alt, check the Green Woolen Bag recipe (skill 75) now needs 5 bolts and makes 10 slots, and whether it and the new reagent bags are bind on equip and can go on the AH.

### Workstream 5: Addon development (in game, /dump and /run)

- **T5.1** `/dump GetBuildInfo()`: expect 1.60.1, build 70888 or later, and 16001 as the fourth return.
- **T5.2** `/dump WOW_PROJECT_ID, WOW_PROJECT_CAMELOT, WOW_PROJECT_MAINLINE`: expect 18, 18, 1.
- **T5.3** `/dump C_AuctionHouse ~= nil, QueryAuctionItems, GetAuctionItemInfo`: expect true, nil, nil.
- **T5.4** At the AH, `/run C_AuctionHouse.ReplicateItems()`, wait for the listing, then `/dump C_AuctionHouse.GetNumReplicateItems()`. Run it again at once with `/etrace` open and look for AUCTION\_HOUSE\_THROTTLED\_MESSAGE\_DROPPED to confirm the 15-minute cooldown.
- **T5.5** `/dump C_AuctionHouse.GetReplicateItemInfo(0)`: confirm itemID is the 17th return and hasAllInfo the 18th.
- **T5.6** `/dump C_AuctionHouse.IsThrottledMessageSystemReady()`.
- **T5.7** Optional, and only with a worthless item in bag 0 slot 1: `/run C_AuctionHouse.PostItem(ItemLocation:CreateFromBagAndSlot(0,1),1,1,nil,10000)` should be blocked as a script action. If the block does not apply it really posts the item, so use something you do not care about.
- **T5.8** With a profession open: `/dump C_TradeSkillUI.GetAllRecipeIDs ~= nil, C_TradeSkillUI.GetRecipeCooldown ~= nil`, then `/dump C_TradeSkillUI.GetRecipeSchematic(<recipeID>, false).reagentSlotSchematics[1]`.
- **T5.9** Relog without opening a profession, then `/dump #C_TradeSkillUI.GetAllRecipeIDs()`: expect 0.
- **T5.10** At the mailbox with an AH sale mail: `/dump GetInboxInvoiceInfo(1)`. Confirm the invoiceType string ("seller" or "buyer") and the order of returns.
- **T5.11** `/dump C_Container.GetContainerItemInfo(0,1)` for field names; at the AH after a browse, `/dump C_AuctionHouse.GetBrowseResults()[1].itemKey` for the itemID field; `/dump C_Timer ~= nil`.
- **T5.12** At the bank: `/dump C_Bank.FetchViewableBankTypes()` to see whether an account bank exists.
- **T5.13** Edit your `MyEcon_Data.lua` on disk while in game, then `/reload` and `/dump` its global: confirms desktop data loads on reload only.
- **T5.14** `/dump issecretvalue, canaccessvalue`: expect functions (secret system active).

### Workstream 6: Third-party price data

- **T6.1 TSM version.** Open `World of Warcraft\_forever_\Interface\AddOns\TradeSkillMaster\TradeSkillMaster.toc` and read `## Version`.
- **T6.2 TSM price sources.** In game, `/dump TSM_API` first to see which functions exist, then `/dump TSM_API.GetPriceSourceKeys({})` and `/dump TSM_API.GetCustomPriceValue("DBMarket", TSM_API.ToItemString("item:<itemId>"))`, using the item ID of something you track. These names come from the brief and are unverified for 4.15.
- **T6.3 AppData.lua.** Open `_forever_\Interface\AddOns\TradeSkillMaster_AppHelper\AppData.lua`. List the distinct tags in the `--<...>` comments, copy the `fields={...}` array from one AUCTIONDB\_NON\_COMMODITY\_DATA and one AUCTIONDB\_REGION\_STAT line, and note the key names (e.g. `Forever-EU`, `Normal-Horde`).
- **T6.4 TSM Accounting.** Open `_forever_\WTF\Account\<account>\SavedVariables\TradeSkillMaster.lua`, find the `@internalData@csvSales` keys and record the header line of each csv key, plus the `_scopeKeys.factionrealm` entries.
- **T6.5 TSM CSV for Forever** (API; the slug is a guess): `curl -sI https://public-data.tradeskillmaster.com/forever/eu/region/items.csv`. 404 means the slug is wrong or Forever is not served.
- **T6.6 AHledger** (API): `curl -s https://api.ahledger.com/v1/markets`, then `curl -s -i -H "Authorization: Bearer $AHL_KEY" "https://api.ahledger.com/v1/prices/forever.normal.horde.eu/<itemId>?range=24h"`. Note which EU markets have a scanner, `Cache-Control` and `latest.observedAt`.
- **T6.7 auctionhouse.fyi** (API): `curl -s -i https://auctionhouse.fyi/api/v1/ah` and look for `.eu` market IDs; read its terms page in a browser.

## Sources

Dates are the source's own date, or the date it was fetched (2026-11-12) when it has none. "Not reachable" entries were tried and failed; that is recorded as a finding.

### Workstream 1: Game Data API

| Source | Date | Supported |
| --- | --- | --- |
| [WoW: Forever API: what works so far, plus a TS client](https://us.forums.blizzard.com/en/blizzard/t/wow-forever-api-what-works-so-far-plus-a-ts-client/60334) (Blizzard API forum) | 2026-11-05, update 11-06 | Namespaces, routes, rulesets, houses, schema, sizes, item 404s |
| [Pinta365/blizzard\_api](https://github.com/Pinta365/blizzard_api) (TypeScript client and docs) | v0.8.5, 2026-11-10; docs checked 2026-11-09 | Routes, trailing slash, types, ruleset table, hosts, OAuth, empty indexes |
| [SideQuest-Guild/wow-forever-sdk](https://github.com/SideQuest-Guild/wow-forever-sdk) (Python SDK, recorded fixtures) | v0.5.1, 2026-11-11; recorded 2026-11-10 and 11 | US house factions, headers, payload and recipe samples |
| [wow-forever-sdk PR #2](https://github.com/SideQuest-Guild/wow-forever-sdk/pull/2) | 2026-11-06 | Auctions live from 2026-11-06 |
| [mhuijskens.com WoW Forever API notes](https://mhuijskens.com/WoWForever/Api/) | checked 2026-11-05 | 403 versus 404, house ID blocks, counts, refresh not measured |
| [ForeverPlusPlus docs/forever-api.md](https://github.com/xIGBClutchIx/ForeverPlusPlus/blob/main/docs/forever-api.md) | last commit 2026-11-11 | Client build and product; no Web API content |
| [World of Warcraft: Forever API Namespace?](https://us.forums.blizzard.com/en/blizzard/t/world-of-warcraft-forever-api-namespace/59774) | 2026-09-29, beta-era | Unanswered pre-launch question |
| [When will we gain API access to Forever APIs?](https://us.forums.blizzard.com/en/blizzard/t/when-will-we-gain-api-access-to-forever-apis/59595) | 2026-09-18 to 10-26, beta-era | No Blizzard reply |
| [goldbook issue #67](https://github.com/jkc-be/goldbook/issues/67) | 2026-10-28, beta-era | Pre-launch 403 namespaces; 36k/h and 100/s cited |
| [API Access - Clients - Rate Limits](https://us.forums.blizzard.com/en/blizzard/t/api-access-clients-rate-limits/5602) | 2020-04-13 | General Battle.net rate limits |
| [GamerFuzion: Forever rule sets stay separate](https://www.gamerfuzion.com/world-of-warcraft-forever-rule-sets-separate-layering-realmless-world-refresh/) | 2026-11-01 | Separate AH per ruleset (secondhand) |
| [ForeverDB](https://foreverdb.net/) | build 70888, fetched 2026-11-12 | Alternative item data |
| [Warcraft Tavern: the Lexicon client](https://www.warcrafttavern.com/forever/news/help-build-a-better-database-for-wow-forever-with-the-lexicon-client/) | 2026-11-05 | WarcraftDB Forever |
| Not reachable | 2026-11-12 | develop.battle.net (robots); wago.tools builds and ItemSparse; Wowhead Forever item pages (empty); forum search |

### Workstream 2: Auction house and mail

| Source | Date | Supported |
| --- | --- | --- |
| [WoW: Forever Hotfixes thread](https://us.forums.blizzard.com/en/wow/t/2403040) (Blizzard, Kaivax) | posts 2026-11-05 to 11-12 | All hotfixes; AH changes pulled, go-live 2026-11-17 |
| [Auction House Min Deposit not Adjusted](https://us.forums.blizzard.com/en/wow/t/auction-house-min-deposit-not-adjusted/2411380) | 2026-11-11 and 12 | Quoted 1c hotfix line; 1s still live; 2-hour listing |
| [Bug: Auction House deposit price](https://us.forums.blizzard.com/en/wow/t/bug-auction-house-deposit-price/2411025) | 2026-11-11 and 12 | "With realm restarts"; 1s retest; 2s Mageweave |
| [Temporary Economy Holds for RMT](https://us.forums.blizzard.com/en/wow/t/temporary-economy-holds-for-rmt/2381433) (Kaivax) | 2026-10-13 | Economy Hold rules |
| [Warcraft Tavern: battle against gold buying](https://www.warcrafttavern.com/forever/news/blizzard-intensifies-their-battle-against-gold-buying-in-wow-forever/) | 2026-10-14 | Hold corroboration |
| [Warcraft Tavern: hotfixes for November 5](https://www.warcrafttavern.com/forever/news/plainsrunning-in-battlegrounds-wow-forever-hotfixes-for-november-5/) | 2026-11-06 | 5 Nov economy items |
| [AuxForever on CurseForge](https://www.curseforge.com/wow/addons/auxforever) | updated 2026-11-10 | Commodities, durations, bids, full-scan throttle |
| [timesaver.gg: AH prices week 1](https://timesaver.gg/blog/wow-forever-auction-house-prices-week-1) | 2026-11-07 | Floor history, refunds, market scope, prices |
| [U4N AH guide](https://www.u4n.com/news/wow-forever-auction-house-guide-commodities-auctionator-and-why-undercutting-has-changed.html) (gold seller) | 2026-10-05, updated 11-11 | Commodity buy mechanic |
| [LFCarry gold economy guide](https://lfcarry.com/guides/wow-forever-gold-economy) (booster, beta-based) | 2026-09-16, modified 11-07 | Cut 5% and 15%, neutral houses (unverified) |
| [AllThings.How: send gear and money to alts](https://allthings.how/world-of-warcraft-forever-how-to-send-gear-and-money-to-your-alts/) | 2026-09-24, pre-launch | Mail claims |
| [BoostRoom economy guide](https://boostroom.com/blog/wow-forever-economy-guide-auction-house-gold-materials-and-trading) | 2026-09-16 | Nothing (says details unknown) |
| [warcraft.wiki.gg Deposit fee](https://warcraft.wiki.gg/wiki/Deposit_fee) | generic, outdated | Not Forever |
| Not reachable | 2026-11-12 | Blizzard news hotfix article body; three Icy Veins Forever AH articles; playnews.gg AH-linking article |

### Workstream 3: Skinning and Leatherworking

| Source | Date | Supported |
| --- | --- | --- |
| [warcraft.wiki.gg Forever leatherworking patterns](https://warcraft.wiki.gg/wiki/Forever_leatherworking_patterns) | fetched 2026-11-12 | Recipe names, skills, sources; spec mention; Legacy points |
| [warcraft.wiki.gg Tanning Rack](https://warcraft.wiki.gg/wiki/Tanning_Rack) | edited 2026-11-10 | Rack reagents, source, ID |
| [warcraft.wiki.gg Sewing Machine](https://warcraft.wiki.gg/wiki/Sewing_Machine) | edited 2026-11-01 | Machine reagents, ID |
| [warcraft.wiki.gg Pattern: Defender's Leather Gloves](https://warcraft.wiki.gg/wiki/Pattern:_Defender%27s_Leather_Gloves) | edited 2026-11-03 | Pattern ID, bind, sources, reagents |
| [warcraft.wiki.gg Fel Leather](https://warcraft.wiki.gg/wiki/Fel_Leather) | edited 2026-11-04 | ID, source, recipes using it |
| [warcraft.wiki.gg Salt Shaker](https://warcraft.wiki.gg/wiki/Salt_Shaker) | edited 2025-07-31, pre-Forever | 3-day cooldown baseline |
| [wow.gg Forever Leatherworking guide](https://wow.gg/professions/forever/leatherworking) | updated 2026-11-08 | Pristine recipe reagents, MF costs, vendors |
| [Wowhead Forever Leatherworking levelling guide](https://www.wowhead.com/forever/profession-leveling-guides/leatherworking) | updated 2026-11-04 | Levelling reagents, vendor NPCs |
| [wow-professions camping guide](https://www.wow-professions.com/forever/camping-guide) | undated | Camp objects |
| [wow-professions Dragonscale Leatherworking](https://www.wow-professions.com/forever/dragonscale-leatherworking) | undated | Dragonscale quest |
| [Warcraft Tavern skinning overview](https://www.warcrafttavern.com/forever/guides/skinning/) | undated | New materials, zone brackets, bonuses |
| [Warcraft Tavern: new Leatherworking patterns](https://www.warcrafttavern.com/forever/news/new-leatherworking-patterns-for-world-of-warcraft-forever/) | 2026-09-17, pre-beta | Set families, bind on equip claim |
| [expcarry Pristine Leather farming](https://expcarry.com/pristine-leather-farming-wow-forever) | 2026-10-14, beta-era | Pristine Leather ID and beta sources |
| [method.gg Waylaid Crates and Merchant's Favor](https://www.method.gg/wow-forever/how-to-get-waylaid-crates-and-merchants-favor-in-wow-forever) | 2026-11-03 | Crates, fills, MF |
| [Blizzard hotfix thread](https://us.forums.blizzard.com/en/wow/t/2403040/1) | 2026-11-05 to 11-11 | Tanning Rack, skinning, crates and writs, vendor prices |
| [timesaver.gg auction prices](https://timesaver.gg/wow-forever/auction-prices) | scans 2026-11-11 | EU and US medians |
| Not reachable | 2026-11-12 | [Wowhead Forever Leatherworking spells](https://www.wowhead.com/forever/spells/professions/leatherworking) (empty); Blizzard news hotfix page; [Mobalytics Leatherworking guide](https://mobalytics.gg/wow-forever/guides/leatherworking-profession-guide) |

### Workstream 4: Disenchanting and Tailoring

| Source | Date | Supported |
| --- | --- | --- |
| [Blizzard hotfix thread](https://us.forums.blizzard.com/en/wow/t/2403040/1) | 2026-11-05 to 11-11 | 11 Nov bags; 10 Nov Salvager, enchants, vendor prices; 6 Nov Tanning Rack; 5 Nov Zephras vendors |
| [warcraft.wiki.gg Arcane Salvager](https://warcraft.wiki.gg/wiki/Arcane_Salvager) | edited 2026-11-01, pre-launch | Salvager details |
| [warcraft.wiki.gg Forever tailoring patterns](https://warcraft.wiki.gg/wiki/Forever_tailoring_patterns) | undated | Bag and Mooncloth skill and source |
| [warcraft.wiki.gg Disenchanting](https://warcraft.wiki.gg/wiki/Disenchanting) | edited 2026-09-30 | No Forever section |
| [WoW-Professions Forever disenchanting guide](https://www.wow-professions.com/forever/disenchanting-guide) | undated | No skill gate; disenchant table and odds |
| [WoW-Professions Forever enchanting guide](https://www.wow-professions.com/forever/enchanting-leveling-guide) | undated, beta-based | Ranks, no Apprentice gate, Mote of Magic |
| [WoW-Professions Forever tailoring trainers](https://www.wow-professions.com/forever/tailoring-trainers) | undated | Ranks, trainers, Zephras Isle |
| [Method.gg Tailoring 1-300](https://www.method.gg/wow-forever/tailoring-in-wow-forever-1-300-leveling-guide-and-trainers) | 2026-11-11 | Ranks including Apprentice level 5; green crafts |
| [Warcraft Tavern professions overview](https://www.warcrafttavern.com/forever/guides/professions/) | undated, about 11-10 | Ranks, level 5 crafting, camp objects |
| [Warcraft Tavern Tailoring](https://www.warcrafttavern.com/forever/guides/tailoring/) | undated | Red Linen Bag, cloth bands, Loom and Spinning Wheel |
| [Warcraft Tavern Enchanting](https://www.warcrafttavern.com/forever/guides/enchanting/) | undated | Wands, Salvager camp buff |
| [timesaver.gg enchanting vellums](https://timesaver.gg/blog/wow-forever-enchanting-vellums) | 2026-11-01, pre-launch | No vellums; scroll IDs in data |
| Not reachable | 2026-11-12 | [Icy Veins Forever enchanting](https://www.icy-veins.com/wow-forever/enchanting); [Mobalytics profession changes](https://mobalytics.gg/wow-forever/guides/wow-forever-all-new-profession-changes); [Metaforge Mooncloth](https://metaforge.app/wow-forever/database/recipes/pattern-mooncloth) |

### Workstream 5: Addon development

| Source | Date | Supported |
| --- | --- | --- |
| [Gethe/wow-ui-source, forever branch](https://github.com/Gethe/wow-ui-source/tree/4cd0ab752a77164f654ccbca9d0c1fe8dafceebe) | commit 2026-11-10, 1.60.1 (70888) | Project ID, game type, AH UI, API docs, MailFrame, Professions |
| [DeepCapt/ahledger-sync](https://github.com/DeepCapt/ahledger-sync/tree/a0399e28307a609c1ad7853945730a4bfb75a58c) | 2026-11-10, addon 0.14.0 | Forever TOC, scan, throttle, mail, sync flow |
| [exceptionptr/tsm-app-linux](https://github.com/exceptionptr/tsm-app-linux/tree/1908e34930f742a3a9ce754faf4e1839431fff3a) | 2026-11-09 | AppData.lua, `_forever_`, AppHelper-Forever, realm folder |
| [warcraft.wiki.gg TOC format](https://warcraft.wiki.gg/wiki/TOC_format) | fetched 2026-11-12 | Interface 16001, suffixes |
| [warcraft.wiki.gg Patch 1.60.1 API notes](https://warcraft.wiki.gg/wiki/Patch_1.60.1/API_changes/notes) | 2026-09-15 to 10-16, beta-era | 12.1.5 base, secrets, Forever alias |
| [warcraft.wiki.gg Patch 1.60.1](https://warcraft.wiki.gg/wiki/Patch_1.60.1) | release 2026-11-04 | Launch date |
| [wiki: ReplicateItems](https://warcraft.wiki.gg/wiki/API_C_AuctionHouse.ReplicateItems), [PostItem](https://warcraft.wiki.gg/wiki/API_C_AuctionHouse.PostItem), [GetAllRecipeIDs](https://warcraft.wiki.gg/wiki/API_C_TradeSkillUI.GetAllRecipeIDs), [SavedVariables](https://warcraft.wiki.gg/wiki/SavedVariables) | fetched 2026-11-12 | Forever tags, cooldown, restrictions, SV paths |
| [UI Add-On Development Policy](https://us.forums.blizzard.com/en/wow/t/ui-add-on-development-policy/24534) | 2018-11-19, text from 2009 | Eight policy clauses |
| [Prohibitions on Third-party Software](https://us.forums.blizzard.com/en/wow/t/prohibitions-on-third-party-software/2142972) | 2025-08-05 | EULA section, cheat detection |
| [AH Automation player thread](https://us.forums.blizzard.com/en/wow/t/ah-automation/562147) | 2020-06-21 | No blue post |
| [Icy Veins: AH hotfix to slow automated addons](https://icy-veins.com/forums/topic/50161-auction-house-hotfix-to-slow-down-automated-addon-features) | undated, retail | Per-player action budget |
| [TSM on CurseForge](https://www.curseforge.com/wow/addons/tradeskill-master) | fetched 2026-11-12 | No Forever flavor |
| [TSM blog announcements](https://blog.tradeskillmaster.com/category/announcement/) | fetched 2026-11-12 | Nothing on 4.15 or Forever |
| [Auctionator on CurseForge](https://www.curseforge.com/wow/addons/auctionator) | file 2026-10-13 | Forever flavor listed |
| [CurseForge blog: migrate addons](https://blog.curseforge.com/wow-forever-migrate-addons-beta-to-live/) | 2026-10-25 | `_forever_` folder |
| [allthings.how: install addons](https://allthings.how/world-of-warcraft-forever-how-to-install-addons-without-the-curseforge-app/) | updated 2026-11-07 | `_forever_`, macOS path |
| [GamesRadar on Forever addon restrictions](https://www.gamesradar.com/games/world-of-warcraft/world-of-warcraft-forever-takes-page-out-of-retails-book-as-blizzard-confirms-access-to-add-ons-will-be-restricted-in-the-throwback-mmo/) | headline only | Secrets apply to Forever |
| Not reachable | 2026-11-12 | Auctionator GitHub repo and raw TOC; TSM GitHub (not found); Icy Veins "Addons in WoW Forever?" article |

### Workstream 6: Third-party price data

| Source | Date | Supported |
| --- | --- | --- |
| [AHledger developers](https://ahledger.com/developers) | undated, content to 2026-11-10 | Endpoints, fields, limits, tiers, terms |
| [AHledger open data](https://ahledger.com/data) | fetched 2026-11-12 | Datasets, build, licence summary |
| [auctionhouse.fyi](https://auctionhouse.fyi) | fetched 2026-11-12 | Existence, player-scan origin |
| [auctionhouse.fyi API docs](https://auctionhouse.fyi/docs/api) | undated, "PREVIEW" | Base URL, auth, units |
| [auctionhouse.fyi openapi.json](https://auctionhouse.fyi/openapi.json) | 1.0.0, fetched 2026-11-12 | Endpoints, fields, market list |
| [ForeverDB API docs](https://foreverdb.net/developers) | fetched 2026-11-12 | Game-data endpoints, limits, terms |
| [TSM support: Public Web API](https://support.tradeskillmaster.com/api-documentation/tsm-public-web-api) | updated 2026-07-05, beta-era | CSV-only public data |
| [TSM Public Pricing Data](https://tradeskillmaster.com/public-data) | undated | CSV paths, freshness |
| [TSM support: price sources](https://support.tradeskillmaster.com/custom-strings/which-price-sources-can-i-use-and-what-do-they-mean) | updated 2024-11-19 | Price source names (baseline) |
| [TSM support: external sources](https://support.tradeskillmaster.com/which-external-sources-are-available-to-use) | updated 2025-07-14 | External sources |
| [TSM addon overview](https://www.tradeskillmaster.com/addon) | undated | AppHelper role |
| [TSM desktop app page](https://www.tradeskillmaster.com/app) | fetched 2026-11-12 | App role |
| [mmonster.co: TSM for WoW Forever](https://mmonster.co/wow-forever/guides/addons/tradeskillmaster) | updated 2026-11-10 | v4.15.5 Forever build |
| [timesaver.gg: Forever addons that work](https://timesaver.gg/blog/wow-forever-addons-save-beta-ui-before-launch) | updated 2026-11-09 | TSM 4.15.5, Auctionator 343 |
| [exceptionptr/tsm-app-linux](https://github.com/exceptionptr/tsm-app-linux) | commit 2026-11-09 | TSM backend, AppData and Accounting formats |
| [timesaver.gg auction prices](https://timesaver.gg/wow-forever/auction-prices) | scans 2026-11-11 | Example EU and US medians |
| Not reachable | 2026-11-12 | `public-data.tradeskillmaster.com` root; auctionhouse.fyi terms; live calls to api.ahledger.com and auctionhouse.fyi/api (proxy) |
