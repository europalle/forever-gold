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
