-- Forever Gold: shared helpers, settings, login lines and slash commands.
local ADDON, FG = ...
_G.ForeverGold = FG

FG.version = "0.1.0"
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

function FG.data()
  local d = _G.ForeverGoldData
  if type(d) == "table" and d.version == 1 then return d end
  return nil
end

function FG.print(msg)
  DEFAULT_CHAT_FRAME:AddMessage(FG.GOLD .. "[Forever Gold]" .. FG.R .. " " .. msg)
end

local defaults = { tooltip = true, chat = true }

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
  FG.print(string.format("%d to post, %d to make, %d to buy, %d to hold. Open the auction house to see them.",
    n(l.sell), n(l.make), n(l.buy), n(l.hold)))
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
  elseif msg == "debug" then
    FG.debug = not FG.debug
    FG.print("Debug " .. (FG.debug and "on." or "off."))
  elseif msg == "" or msg == "panel" then
    if FG.togglePanel then FG.togglePanel() end
  else
    FG.print("/fg: panel. /fg tooltip, /fg chat: switch those on or off.")
  end
end
