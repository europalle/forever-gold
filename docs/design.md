# Design

Dealt with the Taste Skill on 2026-11-13: app style `data-terminal` (seed 1115474654, kind markets, dark). Bubbi's brief: look like a senior frontend dev made it; power users, so no hand-holding copy.

## The style

- Cards darker than the ground (`--panel` on `--bg`), one border, no shadows. Tokens in `src/app/globals.css`.
- The one accent is the gold, and it is only ever a 1px line (the active tab, a focused field), the main data element of a chart or bar list, or a coin. No gold text, no gold buttons: the one filled button is white.
- Figures are white or grey and carry their sign in the text. Green and red only where the column's job is "what moved" or a result.
- Type: Public Sans for text; JetBrains Mono for every figure (class `num`), the style's decision so prices stack digit for digit. Scale: 12 small, 13 body, 16 card title, 20 figures, 26 page title.

## Its face

- Coins: `Money` in `src/components/ui.tsx` prints the figure in ink and g, s, c in gold, silver and copper.
- The mark is the coin from the app icon.
- Item quality is the game's own colour as a 2px bar before the name (`ItemName`).
- Supply as bar lists: the listing ladder on item pages, calls per condition on the Board, drop chances on Research.

## Shell

One top bar (`src/components/header.tsx`): mark, labelled sections with the gold line on the bar's rule, then a freshness line (Prices, Listings, Signals, Your addon; amber when stale, from `src/lib/queries/status.ts`). The sheet dealt an icon rail; redrawn to labels because seven sections with occasional visitors need them. On phones the sections drop to their own scrolling row.

## Rules for new screens

- A title row (`PageTitle`) with one sentence that carries data: the finding, not a description of the page.
- No explanatory paragraphs on the canvas. Method goes behind `How` (a disclosure) or a `title` tooltip. Card notes are a few words at most.
- Tables use `table.data`: no bands, no zebra, numbers right-aligned in `num`.
- One primary button per screen at most.
- Settings pages use `SettingRow`: what it is on the left, its panel on the right.
- Loading states are flat `skeleton` blocks at the real size.

## Checking

`lint.mjs --app src` and `inspect.mjs --app <url>` from the skill. The inspector cannot sign in: run a small proxy that adds the session cookie (see the scratch script used on 2026-11-13: log in with Playwright, forward port 3078 to the dev server with the cookie). Known, accepted warnings: monospace figures (the style's face), the chart tooltip's shadow (an overlay), zero-padding in prices.

## Icons

`ItemIcon` shows Blizzard's icon (URL in `ItemInfo.icon`, filled by the static import) in a 1px border of the quality colour; without one, the quality bar.
