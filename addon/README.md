# Forever Gold addon

Install: copy the `ForeverGold` folder into `World of Warcraft\_forever_\Interface\AddOns\`. The helper program keeps `ForeverGold_Data.lua` up to date; the rest of the folder never changes between updates.

What it does:

- Tooltip block under TSM's: cheapest now, market value, EU demand, the call, and how many you and your alts have. Hold Shift for the reason.
- Three chat lines at login: how fresh the advice is and what is waiting.
- Auction house panel (docks to the right of the auction house; `/fg` opens it anywhere): Sell, Make, Buy, Hold. Clicking a row fills the auction house search box and runs that one search.
- Records, into `WTF\Account\<account>\SavedVariables\ForeverGold.lua`: each character's level, gold and professions (gathering included), item counts in bags, bank and mail, your auctions, sale mails (the real cut and deposit), known recipes with reagents, and item details (level, type, quality) for items the site asks about.

It never posts, buys, cancels, sends mail, crafts or moves items.

In game: a minimap button (left click: panel, right click: settings, drag to move) and a settings page under Esc, Options, AddOns, Forever Gold. Commands: `/fg` (panel), `/fg options`, `/fg status` (what the addon sees: advice age, prices, recorded bags and professions), `/fg tooltip`, `/fg chat`, `/fg debug`.

Tests: `npm run test:addon` loads the addon in a Lua engine with a stand-in for the game's API (`tests/addon/wow-stub.lua`). Pass the path of a real advice file to test with it. The stand-in is not the game: the first real run is in WoW.
