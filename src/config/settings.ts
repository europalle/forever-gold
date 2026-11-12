// Auction house rules and advice thresholds. The fee rules are not confirmed for
// Forever (research section 2): correct them from real sale mails.

export const SETTINGS = {
  // Share of the sale price the auction house keeps on a faction house.
  cut: 0.05,
  // Deposit per listing, copper. 1 silver until the 2026-11-17 maintenance
  // (US date; EU likely a day later), then 1 copper. Lost if the listing expires.
  depositPerListing: 100,
  // Units in a typical listing, used to spread the deposit across a stack.
  lotSize: 20,
  // Hold when the cheapest listing is below this share of TSM's market value,
  // with at least holdNeedsHours of history and no fall steeper than fallingTrend.
  holdBelow: 0.8,
  holdNeedsHours: 24,
  fallingTrend: 0.05,
  // Below this region sale rate an item is a slow seller.
  slowSaleRate: 0.3,
  // A conversion must beat selling raw by this share and this many copper.
  minGainShare: 0.1,
  minGainCopper: 5,
} as const;

export type Settings = typeof SETTINGS;
