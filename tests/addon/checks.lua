local function check(cond, msg) if not cond then error("check failed: " .. msg, 2) end end
local function has(list, pat) for _, l in ipairs(list) do if tostring(l):find(pat) then return true end end return false end

FireEvent("ADDON_LOADED", "ForeverGold")
check(ForeverGoldDB and ForeverGoldDB.settings.tooltip == true, "saved variables initialised")
ForeverGoldDB.chars["Bubbi"] = { level = 1 } -- as saved by 0.2.0 and older
FireEvent("PLAYER_LOGIN")
local withData = ForeverGoldData ~= nil
print("login lines:"); for _, l in ipairs(TEST_LOG) do print("  " .. l) end
if withData then
  check(has(TEST_LOG, "to post"), "login summary")
else
  check(has(TEST_LOG, "No advice yet"), "login says there is no advice")
end

check(FG_NS.playerName() == "Bubbi Hunter", "full name from the player frame")
check(ForeverGoldDB.chars["Bubbi"] == nil, "old first-name record removed")
local c = ForeverGoldDB.chars["Bubbi Hunter"]
check(c and c.level == 30 and c.money == 55606 and c.faction == "Alliance", "player snapshot")
check(c.profs.Skinning and c.profs.Skinning.lvl == 185, "skinning recorded")
check(c.bags[4232] == 12 and c.bags[4304] == 18, "bags counted")
check(c.bagCheck and c.bagCheck.api == "C_Container" and c.bagCheck.slots == 4, "bag check recorded")
do
  -- An older client: bags only through the global functions, several returns.
  local saved = C_Container
  C_Container = nil
  GetContainerNumSlots = function(bag) return bag == 0 and 2 or 0 end
  GetContainerItemID = function(bag, slot) return ({ 4232, 2318 })[slot] end
  GetContainerItemInfo = function(bag, slot) return "tex", ({ 5, 9 })[slot], false, 1 end
  FireEvent("BAG_UPDATE_DELAYED")
  check(c.bags[4232] == 5 and c.bags[2318] == 9 and c.bagCheck.api == "global", "bags read through the older API")
  -- No slots at all (bags unreadable): the last reading is kept.
  GetContainerNumSlots = function() return 0 end
  FireEvent("PLAYER_LOGOUT")
  check(c.bags[4232] == 5, "unreadable bags do not wipe the last reading")
  C_Container, GetContainerNumSlots, GetContainerItemID, GetContainerItemInfo = saved, nil, nil, nil
  FireEvent("BAG_UPDATE_DELAYED")
end

FireEvent("MAIL_SHOW"); FireEvent("MAIL_INBOX_UPDATE")
local n = 0; for k, v in pairs(ForeverGoldDB.invoices) do n = n + 1; check(v.cut == 160 and v.deposit == 100 and v.qty == 10, "invoice fields") end
check(n == 1, "invoice stored once despite two mail events")

check(ForeverGoldDB.items[4232] and ForeverGoldDB.items[4232].il == 25 and ForeverGoldDB.items[4232].c == 7, "item info for a cached item")
check(ForeverGoldDB.items[999999] ~= nil, "item info for an uncached item after it loads")

if withData then
  local lines = TEST_TOOLTIP(4232)
  print("tooltip for Medium Hide:"); for _, l in ipairs(lines) do print("  " .. l) end
  check(has(lines, "Forever Gold") and has(lines, "Cheapest now") and has(lines, "Call") and has(lines, "You have = 12"), "tooltip lines")
  FireEvent("AUCTION_HOUSE_SHOW")
  check(ForeverGoldPanel and ForeverGoldPanel.shown, "panel opens with the auction house")
  local first = ForeverGoldPanel.rows[1]
  print("panel sell tab, first rows:")
  for i = 1, 3 do local r = ForeverGoldPanel.rows[i]; if r.shown then print("  " .. tostring(r.title.text) .. " | " .. tostring(r.right.text) .. " | " .. tostring(r.rightSub.text)) end end
  check(first.shown and first.title.text:find("x"), "sell tab lists carried items first")
  first.scripts.OnClick(first)
  check(TEST_SEARCHED ~= nil, "row click runs a search")
  print("row click searched for: " .. TEST_SEARCHED)
  ForeverGoldPanel.tabs.make.scripts.OnClick()
  print("make tab first row: " .. tostring(ForeverGoldPanel.rows[1].title.text) .. " | " .. tostring(ForeverGoldPanel.rows[1].right.text))
  FireEvent("AUCTION_HOUSE_CLOSED")
  check(not ForeverGoldPanel.shown, "panel closes with the auction house")
else
  local lines = TEST_TOOLTIP(4232)
  check(has(lines, "no advice yet"), "waiting line without data")
end

check(ForeverGoldMinimapButton and TEST_SETTINGS and TEST_SETTINGS.name == "Forever Gold" and TEST_SETTINGS_REGISTERED, "minimap button and settings page exist")
ForeverGoldMinimapButton.scripts.OnClick(ForeverGoldMinimapButton, "RightButton")
check(TEST_SETTINGS_OPENED == 42, "right click opens settings")
local before = #TEST_LOG
SlashCmdList.FOREVERGOLD("status")
print("/fg status:"); for i = before + 1, #TEST_LOG do print("  " .. TEST_LOG[i]) end
check(#TEST_LOG > before + 2, "/fg status prints")
TEST_SETTINGS.frame.scripts.OnShow(TEST_SETTINGS.frame)
SlashCmdList.FOREVERGOLD("tooltip")
check(ForeverGoldDB.settings.tooltip == false, "/fg tooltip toggles")

-- Write ForeverGoldDB the way the client saves it, for the end-to-end upload test.
local function ser(v, ind)
  ind = ind or ""
  if type(v) == "table" then
    local parts = {}
    for k, x in pairs(v) do
      local key = type(k) == "number" and ("[" .. k .. "]") or ("[" .. string.format("%q", k) .. "]")
      table.insert(parts, ind .. " " .. key .. " = " .. ser(x, ind .. " ") .. ",")
    end
    return "{\n" .. table.concat(parts, "\n") .. "\n" .. ind .. "}"
  elseif type(v) == "string" then return string.format("%q", v)
  else return tostring(v) end
end
TEST_SAVED = "\nForeverGoldDB = " .. ser(ForeverGoldDB) .. "\n"

-- Collector: skinning a corpse.
TEST_LOOT = { { 4234, 2 }, { 249427, 1 } }
TEST_LOOT_GUID = "Creature-0-1-0-1-2959-0000"
TEST_TARGET(TEST_LOOT_GUID)
FireEvent("UNIT_SPELLCAST_START", "player", "cast1", 8613)
TEST_TICK(2)
FireEvent("UNIT_SPELLCAST_SUCCEEDED", "player", "cast1", 8613)
FireEvent("LOOT_OPENED")
local e = ForeverGoldDB.loot[#ForeverGoldDB.loot]
check(e.k == "skin" and e.npc == 2959 and e.nm == "Plainstrider" and e.lvl == 34 and e.m == 1426 and e.i[2][1] == 249427, "skinning recorded with mob, level, zone, Pristine Leather")

-- Plain loot, window opened twice: recorded once.
TEST_TICK(30)
TEST_LOOT = { { 2589, 3 } }
TEST_LOOT_GUID = "Creature-0-1-0-1-1150-0001"
local before = #ForeverGoldDB.loot
FireEvent("LOOT_OPENED"); FireEvent("LOOT_OPENED")
check(#ForeverGoldDB.loot == before + 1 and ForeverGoldDB.loot[#ForeverGoldDB.loot].k == "loot", "corpse loot recorded once")

-- Disenchant: the green that leaves the bags is the source.
local bag1 = C_Container.GetContainerItemInfo
local hasGreen = true
C_Container.GetContainerItemInfo = function(bag, slot)
  if bag == 2 and slot == 1 and hasGreen then return { itemID = 6602, stackCount = 1, quality = 2 } end
  return bag1(bag, slot)
end
local slots = C_Container.GetContainerNumSlots
C_Container.GetContainerNumSlots = function(bag) if bag == 2 then return 1 end return slots(bag) end
FireEvent("UNIT_SPELLCAST_START", "player", "cast2", 13262)
hasGreen = false
TEST_TICK(3)
FireEvent("UNIT_SPELLCAST_SUCCEEDED", "player", "cast2", 13262)
TEST_LOOT = { { 11083, 3 } }
TEST_LOOT_GUID = nil
FireEvent("LOOT_OPENED")
e = ForeverGoldDB.loot[#ForeverGoldDB.loot]
check(e.k == "disenchant" and e.src == 6602 and e.i[1][1] == 11083 and e.i[1][2] == 3, "disenchant recorded with its source item")

-- Vendor and trainer.
TEST_NPC_GUID = "Creature-0-1-0-1-1465-0002"
FireEvent("MERCHANT_SHOW")
local v = ForeverGoldDB.vendors[1465]
check(v and v.name == "Test Vendor" and v.items[4289].p == 50 and v.items[4289].q == 5 and v.items[2321].n == 3, "vendor prices recorded")
TEST_NPC_GUID = "Creature-0-1-0-1-1385-0003"
FireEvent("TRAINER_SHOW")
local tr = ForeverGoldDB.trainers[1385]
check(tr and #tr.services == 2 and tr.services[2].s == 150 and tr.services[2].c == 2000 and tr.services[2].item == 4236, "trainer services recorded")
check(ForeverGoldDB.items[4232].n == "Item4232", "item lookups keep the name")
print("collector: " .. #ForeverGoldDB.loot .. " loot events, vendor and trainer recorded")
TEST_SAVED = "\nForeverGoldDB = " .. ser(ForeverGoldDB) .. "\n"

-- Live prices: browse, commodity search, item search and a full scan update
-- prices without a reload.
TEST_ADVANCE(100000) -- now well after the advice's scan time
ForeverGoldDB.settings.tooltip = true -- an earlier check switched it off
TEST_BROWSE = { { itemKey = { itemID = 4232 }, minPrice = 150, totalQuantity = 40 } }
FireEvent("AUCTION_HOUSE_BROWSE_RESULTS_UPDATED")
local price, live = FG_NS.priceNow(4232)
check(live and price == 150, "browse result gives a live price")
if ForeverGoldData then
  local lines = TEST_TOOLTIP(4232)
  check(has(lines, "Cheapest now %(live%)") and has(lines, "<150c>"), "tooltip shows the live price")
end
TEST_COMMODITY[4232] = { { 140, 5 }, { 141, 10 }, { 400, 50 } }
FireEvent("COMMODITY_SEARCH_RESULTS_UPDATED", 4232)
price = FG_NS.priceNow(4232)
check(price == 140 and FG_NS.live[4232].q == 15, "commodity search gives the exact cheapest price and nearby quantity")
FireEvent("ITEM_SEARCH_RESULTS_UPDATED", { itemID = 6602 })
check(FG_NS.priceNow(6602) == 7000, "item search keeps the cheapest buyout")
TEST_REPLICATE = { { 2318, 20, 1000 }, { 2318, 5, 400 }, { 4304, 1, 520 } }
FireEvent("REPLICATE_ITEM_LIST_UPDATE")
check(FG_NS.priceNow(2318) == 50 and FG_NS.priceNow(4304) == 520, "full scan gives per-unit cheapest prices")
print("live prices: browse, search, item search and full scan all update without a reload")

-- Lists only count what you have (bags, bank, mail on any character).
do
  local only = FG_NS.ownedOnly({ 4232, 123456, { id = 4304 } })
  check(#only == 2 and only[1] == 4232 and only[2].id == 4304, "sell, make and hold lists keep only items you have")
  print("owned filter: lists keep only items you have")
end

-- Signals: tooltip line, login alerts, live alerts at the auction house.
do
  ForeverGoldData = ForeverGoldData or { version = 1, generatedAt = time(), scanAt = 0, p = {} }
  local d = ForeverGoldData
  d.p = d.p or {}
  d.p[2318] = { m = 90, v = 100, r = 50, d = 50 }
  d.p[4304] = { m = 900, v = 1000, r = 50, d = 50 }
  d.sig = {
    [4232] = { a = "S", s = 2, c = "SQUEEZE", f = 100, e = 90, t = "Short supply: post now." },
    [4304] = { a = "W", s = 2, c = "CRASH", f = 1000, e = 800, t = "Crashing." },
    [2318] = { a = "B", s = 1, c = "DIP", f = 100, e = 105, t = "Dip." },
  }
  d.alerts = { 4232, 4304 }
  local lines = TEST_TOOLTIP(4232)
  check(has(lines, "Signal") and has(lines, "Strong sell") and has(lines, "short supply"), "tooltip shows the signal")

  local before = #TEST_LOG
  FireEvent("PLAYER_LOGIN")
  local saw = false
  for i = before + 1, #TEST_LOG do if TEST_LOG[i]:find("Strong sell") and TEST_LOG[i]:find("you have 12") then saw = true end end
  check(saw, "login lists strong signals on what you have")

  before = #TEST_LOG
  FG_NS.liveCheck(4232, 150)
  check(#TEST_LOG == before + 1 and TEST_LOG[#TEST_LOG]:find("50%% above usual"), "live alert: well above usual on an item you have")
  FG_NS.liveCheck(2318, 30)
  check(#TEST_LOG == before + 2 and TEST_LOG[#TEST_LOG]:find("70%% under usual"), "live alert: far under usual on a liquid item")
  FG_NS.liveCheck(4304, 500)
  check(#TEST_LOG == before + 3 and TEST_LOG[#TEST_LOG]:find("crashing: wait"), "live alert warns when the item is crashing")
  FG_NS.liveCheck(2318, 25)
  check(#TEST_LOG == before + 3, "one live alert per item per half hour")
  ForeverGoldDB.settings.live = false
  FG_NS.liveCheck(6602, 1)
  check(#TEST_LOG == before + 3, "/fg live switches alerts off")
  print("signals: tooltip, login alerts and live alerts")
end

-- Panel placement: beside the auction house when it is on screen, at the
-- screen's right when an auction addon has parked it away, your spot once dragged.
do
  UIParent.GetWidth = function() return 1920 end
  UIParent.GetHeight = function() return 1080 end
  local ah = AuctionHouseFrame
  ah.IsVisible = function() return true end
  ah.GetLeft = function() return 100 end; ah.GetRight = function() return 900 end
  ah.GetTop = function() return 900 end; ah.GetBottom = function() return 300 end
  FireEvent("AUCTION_HOUSE_SHOW")
  check(FG_NS.placePanel() == "right", "panel docks to the right of the auction house")
  ah.GetLeft = function() return 1000 end; ah.GetRight = function() return 1800 end
  check(FG_NS.placePanel() == "left", "panel docks to the left when the right has no room")
  ah.GetLeft = function() return -5000 end; ah.GetRight = function() return -4200 end
  check(FG_NS.placePanel() == "screen", "panel stays on screen when the auction window is parked off screen")
  ForeverGoldDB.settings.panelPos = { "CENTER", "CENTER", 10, 20 }
  check(FG_NS.placePanel() == "saved", "a dragged position is kept")
  SlashCmdList.FOREVERGOLD("dock")
  check(ForeverGoldDB.settings.panelPos == nil, "/fg dock forgets the dragged position")
  print("panel placement: docked, flipped, on screen, saved")
end
