# Forever Gold: WoW Forever market analyst

Read this whole file first. It is the brief and the findings from the planning session (2026-11-12). The full research report goes in `docs/research.md`; this file records what has been checked since and what was decided.

## What this is

A private tool that tells Bubbi what to skin, craft, disenchant, buy and post in World of Warcraft: Forever (launched 2026-11-04). It advises only. Every in-game action stays a manual click. Nothing in this project may send input to the game, read game memory, or call a restricted auction function without a hardware click.

## The player

- Market: EU, PvP ruleset, Alliance.
- Bubbi Hunter (main, level 30 on 2026-11-12): Skinning 185/225, Leatherworking 105/150, Cooking 115, First Aid 30.
- Bubbi Banken (level 1 bank alt, sits at the auction house): Tailoring 63/75, Enchanting 35/75. Both capped at 75 until the character is level 10.
- Bankroll on 2026-11-12: about 10g across both. Advice must respect that: small stakes, no single buy above a few percent of gold.
- Uses TSM 4.15 with the imported profile `BilisClassicForever(v1.0.1)`, defaults untouched. TSM's saved recipe list was empty and the "mail disenchantables to" character was blank.
- Income so far is raw materials (leather, hides, cloth) and disenchant output sold from the alt.

## Parts

1. Collector (server, scheduled): pulls price files, stores history in Postgres.
2. Addon (`Interface 16001`, `_Forever.toc`): records bags, bank, mail, own auctions, sale invoices, known recipes with reagents, cooldowns, skills, and TSM prices. Saves to SavedVariables (written only at logout and /reload).
3. Companion (small desktop file watcher): uploads the SavedVariables file, writes the day's advice into a TOC-listed Lua file in our own addon folder. Model: AHledger's sync app (research 5.7).
4. Engine: sell raw vs cure vs craft per leather tier, craft profit after fees, disenchant value of listed greens, underpriced listings, crate fills, post prices.
5. Web dashboard with a daily briefing; in-game tooltips and a "today" panel. Buy and post lists leave as TSM or Auctionator import strings.

Build order: collector and history first (every unrecorded day is lost), then addon and companion, engine, dashboard, in-game panel.

## Data sources, as verified on 2026-11-12

- TSM public files (tested, no key): `https://public-data.tradeskillmaster.com/forever/eu/realm/pvp-alliance/items.csv` with `itemId,name,marketValue,minBuyout,recent,historical,updatedAt` (6,480 items, data a few hours old, cache 4h). `https://public-data.tradeskillmaster.com/forever/eu/region/items.csv` with `itemId,name,marketValue,historical,avgSalePrice,saleRate,soldPerDay,updatedAt` (7,008 items, daily, all EU rulesets and factions mixed). Prices in copper. This is the first price feed. TSM's usage terms were not read (their site blocks cloud IPs): Bubbi to check the public-data page.
- Blizzard Game Data API (research section 1): `dynamic-forever-eu`, ruleset and house routes. Needed for listing depth and for recipes with reagents (`/data/wow/profession/164/skill-tier/2938`, `/data/wow/recipe/{id}`). Needs a Battle.net client. Open: which house ID is EU Alliance PvP.
- AHledger API (research 6.2): market `forever.pvp.alliance.eu`, has ready crafting, disenchant and deals endpoints. Use live with credit; from 2026-12-10 responses may not be kept past cache time, so never build history from it.
- `api.tradeskillmaster.com/addon/`: dead, certificate expired April 2026. TSM's desktop backend is not for third-party use. Do not build on either.
- In-game: `TSM_API.GetCustomPriceValue` from our addon; sale mails via `GetInboxInvoiceInfo` give the real cut and deposit.

## Research questions already answered by Bubbi's own data

- Level 1 can train Tailoring and Enchanting: yes, the alt has both.
- Disenchant skill gate: the alt at Enchanting 35 or lower sold Vision Dust and Lesser Nether Essence it very likely produced. Strong sign of no gate. Confirm with Bubbi.
- TSM file slug for Forever is `forever`; per-market files exist (the report says unknown).
- TSM Accounting format: `r@PvP@internalData@csvSales` with header `itemString,stackSize,quantity,price,otherPlayer,player,time,source`; faction scope key is `Alliance - PvP`.
- Postage is 30 copper per attached item (every charge in the ledger is a multiple of 30).
- The Bilis profile assumes a 5% cut. Still to confirm from a sale mail.

## Still open (hold as settings, not constants)

- AH cut and deposit formula. Minimum deposit is 1 silver until the 2026-11-17 maintenance (US date; EU likely a day later), then 1 copper.
- Whether an item auction's `buyout` in Blizzard's API is per stack or per unit.
- Salt Shaker: who makes it and its cooldown. Cured Rugged Hide lists near 14g on this market with no recorded sales.
- Disenchant odds per bracket (one beta-era table, research 4.3).
- Which TSM price sources hold data in-game on Forever.

## Findings that shape the advice

- Buying leather to craft armor kits loses money on this market (Thick Armor Kit: about 25s of Thick Leather for an 11s 50c sale). Kits are for skill-ups or dumping own leather.
- Region prices mislead: Pristine Hide is 4s here against 10s 63c region-wide.
- The alt cannot reach an Arcane Salvager (needs Enchanting 140 on someone).

## Stack and conventions

Same as Bubbi's other project unless he says otherwise: Next.js (App Router), TypeScript, Tailwind, Prisma + Postgres, Vercel. Minimal dependencies. Plain, direct UI copy with no em dashes. Never commit secrets; Battle.net and other keys go in environment secrets. Small commits, one feature each.

## First session

1. Environment checks, repo scaffold, `.env.example`.
2. Collector for the two TSM files with a history table, on a schedule. Measure the real refresh cadence.
3. A first page: Bubbi's tracked items (leather, hides, cloth, dusts, essences) with current price, 7-day trend, region sale rate, and a sell raw / cure / hold call.
4. Then ask Bubbi for the Battle.net client and start the addon.

## Notes from session one (2026-11-12)

- Stack: Next.js 16.4 (`cacheComponents` and `partialPrefetching` on: uncached database reads sit in `<Suspense>` after `await connection()`), Prisma 7.10 with `@prisma/adapter-pg`, client generated to `src/generated/prisma` (ignored; `postinstall` rebuilds it), Tailwind 4, Vitest. `AGENTS.md` is written by Next itself: read the guides in `node_modules/next/dist/docs/` before relying on memory.
- Collector: `src/lib/collector.ts`. Each TSM file is stored once per scan time (`Snapshot` plus `MarketPrice` or `RegionStat`), with ETag so an unchanged file answers 304. Retention: everything for 14 days, then the last snapshot of each UTC day. Runs from `npm run collect`, `GET /api/cron/collect` with `Authorization: Bearer $CRON_SECRET`, or `.github/workflows/collect.yml` hourly once the repo secret `DATABASE_URL` is set.
- Measured cadence: market file scans at 09:25 and 12:25 UTC on 2026-11-12, so about every 3 hours. The region file was a day old at fetch.
- Prices above 2^31 copper (about 214,748g) are stored as unknown: one joke listing sat at 2.2 million gold.
- A market snapshot is about 0.7 MB in Postgres.
- Advice: `src/lib/advice.ts` (pure, tested), items and conversions in `src/config/items.ts`, skills in `src/config/player.ts`, fees and thresholds in `src/config/settings.ts`. "Hold" needs 24 hours of history and no fall steeper than 5%: week-two prices slide down from launch highs, and the first version wrongly told Bubbi to hold twelve items into that slide. Cure recipes are Classic Era values except Cured Heavy Hide; the addon should replace them with real reagents.
- Local dev in the cloud sandbox: Node's `fetch` needs `NODE_USE_ENV_PROXY=1`. Postgres 16 runs on port 5433 with its socket in /tmp (`DATABASE_URL` in `.env.example`); start it with `pg_ctl -D /home/user/pgdata-forever -o '-p 5433 -k /tmp' start` as the postgres user. It does not survive a worker restart.
- Login (Bubbi chose a single password over Steam): `APP_PASSWORD` plus a signed 30-day cookie keyed by `SESSION_SECRET` (`src/lib/session.ts`, Web Crypto, no dependency). `src/proxy.ts` redirects early; `requireSession()` in `src/lib/auth.ts` is the real check, called before the board reads data. `/api/cron/collect` keeps its own bearer check.
- `src/lib/database-url.ts` takes the first plain `postgres://` string from `DATABASE_URL`, `POSTGRES_URL` or `POSTGRES_PRISMA_URL` (runtime) and prefers `DATABASE_URL_DIRECT`, `DATABASE_URL_UNPOOLED` or `POSTGRES_URL_NON_POOLING` for migrations, skipping `prisma+postgres://` Accelerate URLs.
- The collector workflow runs every 2 hours, not hourly: GitHub's free Actions minutes for a private repo (2,000 a month) and TSM's ~3-hour cadence.
- `docs/setup.md` is the setup checklist for Bubbi. `docs/mockups/addon.html` is the agreed look for the addon: tooltip block under TSM's with a yellow "Forever Gold" header, an auction house panel with Sell / Make / Buy / Hold tabs, a mailbox list of greens for the alt, three chat lines at login. Rows run one search per click at most; nothing posts, buys, attaches or sends.
- Bubbi's screenshots (2026-11-12) show TSM's in-game "Disenchant Value" has data on Forever, and another addon's "Expected disenchant value" showed "No data". His UI is the Classic-style default with a few addons (RestedXP guides, Questie, Details).
