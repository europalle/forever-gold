# Signals

The site reads every traded item like a commodity and makes one call per item: buy, sell, hold, wait or nothing. Code: `src/lib/signals.ts` (pure, tested in `tests/signals.test.ts`), run after each collection by `src/lib/signal-run.ts`, shown on `/signals`, on item pages, and in game through the advice file.

## Inputs

- **Price:** the cheapest listing per unit. TSM's minimum buyout every 3 hours plus Blizzard's hourly listing, 14 days.
- **Usual price:** the median of that over the last 7 days. Robust to a few odd listings, and it moves slowly enough to be a reference.
- **Supply:** units listed, from Blizzard's listing (hourly for 72 hours in `DepthItem`, every ~3 hours for 30 days in `SupplyPoint`), against its own 7-day median. This is how oil traders read crude stockpiles: not the level, the level against normal.
- **Liquidity:** EU-wide sold per day and sale rate from TSM's region file. That file mixes every ruleset and faction, so it only decides whether an item trades at all (5+ a day, 20%+ of listings sell). Illiquid items never get a buy.
- **Trend:** Theil-Sen slope of the log price over 5 days, with how many point pairs agree (0.7+ counts as steady), and the same slope before the last 36 hours, which tells a slide (falling then too) from a sudden drop (flat then).

## The calls and the real markets behind them

| Call | Rule | Real-world case | Why it carries over |
| --- | --- | --- | --- |
| Flooded: hold | Supply 1.6x+ normal and still growing 15%+ a day, price not rising | Oil glut 2014-16; the hog cycle (cobweb model) | High prices pull farmers in, supply overshoots, prices sag until it clears. Selling into the glut sells at the low. |
| Flooded, clearing: buy | Supply 1.6x+ but shrinking, price 20%+ under usual, liquid | Glut drawdown | When stockpiles start falling, the price floor is usually in. |
| Crashing: wait | Down 20%+ in a day, supply still rising | Flash crashes, "falling knife" | Momentum on the way down: the next listing is likely cheaper. |
| Crashing, done: strong buy | Down 20%+, supply shrinking 10%+ a day, last price held, liquid, 25%+ under usual | Capitulation, 2020 oil rebound | Sellers who panic dump at once; once they are done a liquid item snaps back. |
| Short supply: strong sell | Supply under half of normal, falling, price up 10%+ in a day | 1973 oil embargo, supply shocks | The high price brings farmers back within days (the cobweb again), so the peak is short. |
| Spiked: sell | 2.5 typical swings and 40%+ above usual, no shortage | Pump and mean reversion | A price without a supply reason behind it does not hold. |
| Sliding: sell | Steady fall of 4%+ a day, falling before the last 36 hours too | Launch decay: consoles, IPOs after lockup | A new game's prices drift down as more players reach each tier. Today's price is the best one. |
| Dip: buy | 25%+ under usual, liquid, not sliding before, no glut | Value buying in a liquid market | One seller undercut hard; the market price returns. |
| Above usual: sell | 25%+ above usual, not falling | Taking profit | Sell what you hold while it is rich. |
| Rising: hold | Steady rise of 4%+ a day, supply at or under normal | Time-series momentum | Trends in thin supply tend to continue for a while. |

The 24-hour forecast: half the 5-day trend carries on, a quarter of the gap to the usual price closes (a twentieth in a steady trend, where the weekly median lags), and a growing glut takes 3% off.

## Is it right?

`/signals`, Track record:
- **Replay:** every 6 hours the rules run over the last two weeks of the 400 most traded items, as if it were back then, and each new call is judged 72 hours later after the 5% cut. A buy is right if selling then nets more than it cost; a sell if the price was not higher; a hold if it fell under 5%; a wait if it got cheaper within the day. The forecast is scored against "the price stays put".
- **Live:** every call is stored in `SignalEvent` when it first appears, and judged the same way once 72 hours old.

Tune thresholds in `SIGNAL_RULES` and the rule bodies only against these numbers, not by feel.

## In game (addon 0.4.0)

- Tooltip: the call, the usual price and the 24-hour forecast; Shift shows the reason.
- Panel: a Signals tab with the strongest calls on what you hold, then strong buys within the buy limit.
- Login: up to four strong calls in chat.
- Live alerts: when the auction house shows a liquid item 35%+ under its usual price, or something you hold 40%+ above it, a chat line (once per item per half hour, at most three in ten seconds; `/fg live` turns them off). Crashing and flooded items get "wait" instead of "buy".
