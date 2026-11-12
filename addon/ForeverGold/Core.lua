-- Forever Gold: shared helpers, settings, login lines and slash commands.
local ADDON, FG = ...
_G.ForeverGold = FG

FG.version = "0.4.0"
FG.GOLD = "|cffffd100"
FG.MUTED = "|cff9d9d9d"
FG.GOOD = "|cff40ff40"
FG.WARN = "|cffffb030"
FG.R = "|r"

-- Calls into APIs that may not exist or may behave differently on Forever go
-- through here: a failure is swallowed, never shown as a Lua error.
local function pass(ok, ...)
  if ok then return ... end
  return nil
end

function FG.try(fn, ...)
  if type(fn) ~= "function" then return nil end
  return pass(pcall(fn, ...)) -- every return value, however many
end

-- Values the client may mark secret (the Midnight API rules) cannot be used.
function FG.usable(v)
  if v == nil then return false end
  if issecretvalue and FG.try(issecretvalue, v) then return false end
  return true
end

-- Bag slots, through whichever container API this client has: C_Container
-- (a table per slot) or the older globals (several return values).
function FG.bagSlots(bag)
  if C_Container and C_Container.GetContainerNumSlots then
    local n = FG.try(C_Container.GetContainerNumSlots, bag)
    if n then return n, "C_Container" end
  end
  if GetContainerNumSlots then return FG.try(GetContainerNumSlots, bag) or 0, "global" end
  return 0, "none"
end

-- itemID, count, quality of one slot, or nil.
function FG.bagItem(bag, slot)
  if C_Container and C_Container.GetContainerItemInfo then
    local info = FG.try(C_Container.GetContainerItemInfo, bag, slot)
    if type(info) == "table" and info.itemID and FG.usable(info.itemID) then
      return info.itemID, info.stackCount or 1, info.quality
    end
  end
  local id = (C_Container and C_Container.GetContainerItemID and FG.try(C_Container.GetContainerItemID, bag, slot))
    or (GetContainerItemID and FG.try(GetContainerItemID, bag, slot))
  if not id or not FG.usable(id) then return nil end
  local count, quality = 1, nil
  if GetContainerItemInfo then
    local _, c, _, q = FG.try(GetContainerItemInfo, bag, slot)
    if type(c) == "number" then count = c end
    if type(q) == "number" then quality = q end
  end
  if not quality and GetItemInfo then quality = select(3, FG.try(GetItemInfo, id)) end
  return id, count, quality
end

-- How many of an item you have: on this character, and on your other
-- characters (bags, bank and mail, as last seen by the addon).
function FG.owned(id)
  local here, others = 0, 0
  local me = FG.playerName()
  for name, c in pairs(FG.db and FG.db.chars or {}) do
    local n = ((c.bags or {})[id] or 0) + ((c.bank or {})[id] or 0) + ((c.mail or {})[id] or 0)
    if name == me then here = here + n else others = others + n end
  end
  return here, others
end

-- The ids in a list that you have somewhere.
function FG.ownedOnly(list)
  local out = {}
  for _, e in ipairs(list or {}) do
    local id = type(e) == "table" and e.id or e
    local here, others = FG.owned(id)
    if here + others > 0 then table.insert(out, e) end
  end
  return out
end

function FG.money(copper)
  if not copper then return FG.MUTED .. "-" .. FG.R end
  copper = math.floor(copper + 0.5)
  if GetCoinTextureString then
    local s = FG.try(GetCoinTextureString, copper)
    if s then return s end
  end
  local g, s, c = math.floor(copper / 10000), math.floor((copper % 10000) / 100), copper % 100
  if g > 0 then return string.format("%dg %02ds %02dc", g, s, c) end
  if s > 0 then return string.format("%ds %02dc", s, c) end
  return string.format("%dc", c)
end

function FG.ago(unix)
  if not unix or unix == 0 then return "never" end
  local mins = math.floor((time() - unix) / 60)
  if mins < 1 then return "moments" end -- includes a PC clock a little behind the server
  if mins < 60 then return mins .. " min" end
  if mins < 48 * 60 then return math.floor(mins / 60 + 0.5) .. " h" end
  return math.floor(mins / 1440 + 0.5) .. " days"
end

-- The character's full name. Forever names can have a surname ("Bubbi
-- Hunter") that UnitName leaves out, so two characters could share "Bubbi".
-- Try every name source and keep the longest that starts with the first name.
function FG.playerName()
  if FG._name then return FG._name end
  local first = UnitName("player")
  if not first or not FG.usable(first) then return nil end
  local best, seen = first, {}
  local function consider(source, v)
    if type(v) ~= "string" or v == "" or not FG.usable(v) then return end
    v = v:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", ""):match("^%s*(.-)%s*$")
    seen[source] = v
    if v:sub(1, #first) == first and #v > #best and #v <= 48 then best = v end
  end
  consider("GetUnitName", FG.try(GetUnitName, "player", false))
  consider("UnitFullName", FG.try(UnitFullName, "player"))
  consider("UnitNameUnmodified", UnitNameUnmodified and FG.try(UnitNameUnmodified, "player"))
  consider("PlayerName", _G.PlayerName and FG.try(_G.PlayerName.GetText, _G.PlayerName))
  local pf = _G.PlayerFrame
  local pfName = pf and (pf.name or (pf.PlayerFrameContent and pf.PlayerFrameContent.PlayerFrameContentMain and pf.PlayerFrameContent.PlayerFrameContentMain.Name))
  consider("PlayerFrame", pfName and pfName.GetText and FG.try(pfName.GetText, pfName))
  FG._name, FG._nameSources = best, seen
  return best
end

function FG.data()
  local d = _G.ForeverGoldData
  if type(d) == "table" and d.version == 1 then return d end
  return nil
end

function FG.print(msg)
  DEFAULT_CHAT_FRAME:AddMessage(FG.GOLD .. "[Forever Gold]" .. FG.R .. " " .. msg)
end

local defaults = { tooltip = true, chat = true, live = true, minimap = true, minimapAngle = 200 }

local frame = CreateFrame("Frame")
FG.events = frame
local handlers = {}
function FG.on(event, fn)
  handlers[event] = handlers[event] or {}
  table.insert(handlers[event], fn)
  frame:RegisterEvent(event)
end
frame:SetScript("OnEvent", function(_, event, ...)
  for _, fn in ipairs(handlers[event] or {}) do
    local ok, err = pcall(fn, event, ...)
    if not ok and FG.debug then FG.print("error in " .. event .. ": " .. tostring(err)) end
  end
end)

FG.on("ADDON_LOADED", function(_, name)
  if name ~= ADDON then return end
  ForeverGoldDB = ForeverGoldDB or {}
  local db = ForeverGoldDB
  db.version = 1
  db.chars = db.chars or {}
  db.items = db.items or {}
  db.invoices = db.invoices or {}
  db.settings = db.settings or {}
  for k, v in pairs(defaults) do
    if db.settings[k] == nil then db.settings[k] = v end
  end
  FG.db = db
end)

FG.on("PLAYER_LOGIN", function()
  if not (FG.db and FG.db.settings.chat) then return end
  local d = FG.data()
  if not d then
    FG.print("No advice yet. Start the Forever Gold helper on your PC, then /reload.")
    return
  end
  FG.print(string.format("Advice for %s from %s ago (prices %s old).", d.user or "you", FG.ago(d.generatedAt), FG.ago(d.scanAt)))
  local l = d.lists or {}
  local n = function(t) return t and #t or 0 end
  FG.print(string.format("You have %d to post, %d to make into something better and %d to hold; %d deals to buy. Open the auction house to see them.",
    n(FG.ownedOnly(l.sell)), n(FG.ownedOnly(l.make)), n(FG.ownedOnly(l.hold)), n(l.buy)))
  if (d.deposit or 0) >= 100 then
    FG.print(FG.WARN .. "Deposits are " .. FG.money(d.deposit) .. " per listing: post in full stacks." .. FG.R)
  end
end)

SLASH_FOREVERGOLD1 = "/fg"
SLASH_FOREVERGOLD2 = "/forevergold"
SlashCmdList.FOREVERGOLD = function(msg)
  msg = (msg or ""):lower():match("^%s*(.-)%s*$")
  local s = FG.db and FG.db.settings
  if msg == "tooltip" and s then
    s.tooltip = not s.tooltip
    FG.print("Tooltip lines " .. (s.tooltip and "on." or "off."))
  elseif msg == "chat" and s then
    s.chat = not s.chat
    FG.print("Login messages " .. (s.chat and "on." or "off."))
  elseif msg == "live" and s then
    s.live = not s.live
    FG.print("Live price alerts at the auction house " .. (s.live and "on." or "off."))
  elseif msg == "status" then
    FG.status()
  elseif msg == "options" or msg == "settings" then
    if FG.openSettings then FG.openSettings() end
  elseif msg == "debug" then
    FG.debug = not FG.debug
    FG.print("Debug " .. (FG.debug and "on." or "off."))
  elseif msg == "" or msg == "panel" then
    if FG.togglePanel then FG.togglePanel() end
  else
    FG.print("/fg: panel. /fg options: settings. /fg status: what the addon sees. /fg tooltip, /fg chat, /fg live: switch those on or off.")
  end
end
