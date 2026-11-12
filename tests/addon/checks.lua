local function check(cond, msg) if not cond then error("check failed: " .. msg, 2) end end
local function has(list, pat) for _, l in ipairs(list) do if tostring(l):find(pat) then return true end end return false end

FireEvent("ADDON_LOADED", "ForeverGold")
check(ForeverGoldDB and ForeverGoldDB.settings.tooltip == true, "saved variables initialised")
FireEvent("PLAYER_LOGIN")
local withData = ForeverGoldData ~= nil
print("login lines:"); for _, l in ipairs(TEST_LOG) do print("  " .. l) end
if withData then
  check(has(TEST_LOG, "to post"), "login summary")
else
  check(has(TEST_LOG, "No advice yet"), "login says there is no advice")
end

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
  check(#lines == 0, "no tooltip lines without data")
end
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
