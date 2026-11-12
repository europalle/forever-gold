-- Live prices from the auction house you are looking at. The game hands search
-- and scan results to every addon; this keeps the cheapest price per item so
-- tooltips and the panel are current without a /reload. Reads only.
local _, FG = ...

FG.live = {} -- itemId -> { m = cheapest per unit, q = quantity at or near it, at = time() }

local function put(id, unit, qty)
  if type(id) ~= "number" or type(unit) ~= "number" or unit <= 0 then return end
  local e = FG.live[id]
  -- One scan or search pass can report an item several times: keep the cheapest.
  if e and e.at == time() and e.m <= unit then return end
  FG.live[id] = { m = math.floor(unit + 0.5), q = qty, at = time() }
end

-- The best price for an item: live when it is newer than the advice.
function FG.priceNow(id)
  local d = FG.data()
  local p = d and d.p and d.p[id]
  local l = FG.live[id]
  if l and (not d or l.at > (d.scanAt or 0)) then return l.m, true, l.at end
  return p and p.m, false, d and d.scanAt
end

-- Browse results: every row is one item with its cheapest price and quantity.
FG.on("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED", function()
  if not (C_AuctionHouse and C_AuctionHouse.GetBrowseResults) then return end
  for _, r in ipairs(FG.try(C_AuctionHouse.GetBrowseResults) or {}) do
    if r.itemKey and r.minPrice then
      put(r.itemKey.itemID, r.minPrice, r.totalQuantity)
      if FG.liveCheck then FG.liveCheck(r.itemKey.itemID, r.minPrice) end
    end
  end
  if FG.refreshPanel then FG.refreshPanel() end
end)
FG.on("AUCTION_HOUSE_BROWSE_RESULTS_ADDED", function(_, added)
  for _, r in ipairs(type(added) == "table" and added or {}) do
    if r.itemKey and r.minPrice then put(r.itemKey.itemID, r.minPrice, r.totalQuantity) end
  end
end)

-- Opening a commodity: results come cheapest first.
FG.on("COMMODITY_SEARCH_RESULTS_UPDATED", function(_, itemID)
  if not (C_AuctionHouse and C_AuctionHouse.GetCommoditySearchResultInfo) then return end
  local first = FG.try(C_AuctionHouse.GetCommoditySearchResultInfo, itemID, 1)
  if first and first.unitPrice then
    local qty, n = 0, FG.try(C_AuctionHouse.GetNumCommoditySearchResults, itemID) or 1
    for i = 1, math.min(n, 20) do
      local r = FG.try(C_AuctionHouse.GetCommoditySearchResultInfo, itemID, i)
      if r and r.unitPrice and r.unitPrice <= first.unitPrice * 1.05 then qty = qty + (r.quantity or 0) end
    end
    FG.live[itemID] = nil -- an exact search replaces older readings
    put(itemID, first.unitPrice, qty)
    if FG.liveCheck then FG.liveCheck(itemID, first.unitPrice) end
    if FG.refreshPanel then FG.refreshPanel() end
  end
end)

-- Opening a non-stackable item: the cheapest buyout among its listings.
FG.on("ITEM_SEARCH_RESULTS_UPDATED", function(_, itemKey)
  if not (itemKey and C_AuctionHouse and C_AuctionHouse.GetItemSearchResultInfo) then return end
  local best, n = nil, FG.try(C_AuctionHouse.GetNumItemSearchResults, itemKey) or 0
  for i = 1, math.min(n, 50) do
    local r = FG.try(C_AuctionHouse.GetItemSearchResultInfo, itemKey, i)
    local unit = r and r.buyoutAmount and r.buyoutAmount / math.max(1, r.quantity or 1)
    if unit and (not best or unit < best) then best = unit end
  end
  if best then
    FG.live[itemKey.itemID] = nil
    put(itemKey.itemID, best, nil)
    if FG.liveCheck then FG.liveCheck(itemKey.itemID, best) end
  end
end)

-- A full scan run by TSM, Auctionator or AHledger: read it a slice at a time.
local reading = false
FG.on("REPLICATE_ITEM_LIST_UPDATE", function()
  if reading or not (C_AuctionHouse and C_AuctionHouse.GetNumReplicateItems and C_Timer) then return end
  local n = FG.try(C_AuctionHouse.GetNumReplicateItems) or 0
  if n == 0 then return end
  reading = true
  local i, best = 0, {}
  local function step()
    local stop = math.min(n, i + 2000)
    for idx = i, stop - 1 do
      local _, _, count, _, _, _, _, _, _, buyout, _, _, _, _, _, _, itemID = FG.try(C_AuctionHouse.GetReplicateItemInfo, idx)
      if itemID and buyout and buyout > 0 then
        local unit = buyout / math.max(1, count or 1)
        if not best[itemID] or unit < best[itemID] then best[itemID] = unit end
      end
    end
    i = stop
    if i < n then
      C_Timer.After(0, step)
    else
      local now = time()
      for id, unit in pairs(best) do FG.live[id] = { m = math.floor(unit + 0.5), at = now } end
      reading = false
      if FG.refreshPanel then FG.refreshPanel() end
    end
  end
  step()
end)
