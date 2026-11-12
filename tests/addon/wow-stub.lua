-- A stand-in for the parts of the WoW client API the addon touches. Frames
-- accept any method; a few remember state so the tests can look at it.
local unpack = unpack or table.unpack
local log = {}
_G.TEST_LOG = log

local function noop() end
local Frame = {}
Frame.__index = function(t, k)
  local v = rawget(Frame, k)
  if v ~= nil then return v end
  return noop
end
function Frame:Show() self.shown = true; if self.scripts.OnShow then self.scripts.OnShow(self) end end
function Frame:Hide() self.shown = false end
function Frame:IsShown() return self.shown end
function Frame:SetShown(v) self.shown = v and true or false end
function Frame:SetScript(name, fn) self.scripts[name] = fn end
function Frame:HookScript(name, fn) self.scripts[name] = fn end
function Frame:RegisterEvent(e) self.events[e] = true end
function Frame:SetText(t) self.text = t end
function Frame:GetText() return self.text end
function Frame:SetTexture(t) self.texture = t end
function Frame:CreateFontString() return setmetatable({ scripts = {}, events = {} }, Frame) end
function Frame:CreateTexture() return setmetatable({ scripts = {}, events = {} }, Frame) end
local allFrames = {}
function CreateFrame(kind, name)
  local f = setmetatable({ scripts = {}, events = {}, kind = kind }, Frame)
  if name then _G[name] = f end
  table.insert(allFrames, f)
  return f
end
_G.TEST_FRAMES = allFrames

function FireEvent(event, ...)
  for _, f in ipairs(allFrames) do
    if f.events[event] and f.scripts.OnEvent then f.scripts.OnEvent(f, event, ...) end
  end
end

UIParent = CreateFrame("Frame")
UISpecialFrames = {}
SlashCmdList = {}
NUM_TOTAL_EQUIPPED_BAG_SLOTS = 5
local now = 1794500000
function time() return now end
function TEST_ADVANCE(s) now = now + s end
C_Timer = {
  After = function(_, fn) fn() end,
  NewTicker = function(_, fn) local t = { cancelled = false }; function t:Cancel() self.cancelled = true end
    for _ = 1, 400 do if t.cancelled then break end fn() end; return t end,
}
DEFAULT_CHAT_FRAME = { AddMessage = function(_, m) table.insert(log, m) end }
function UnitName() return "Bubbi Hunter" end
function UnitFactionGroup() return "Alliance" end
function UnitClass() return "Hunter", "HUNTER" end
function UnitLevel() return 30 end
function GetMoney() return 55606 end
function GetNormalizedRealmName() return "PvP" end
function GetCoinTextureString(c) return "<" .. c .. "c>" end
function IsShiftKeyDown() return false end
function GetProfessions() return 1, 2, nil, nil, 3 end
local PROFS = { { "Skinning", 185, 225 }, { "Leatherworking", 105, 150 }, { "Cooking", 115, 150 } }
function GetProfessionInfo(i) local p = PROFS[i]; return p[1], 0, p[2], p[3] end
local BAGS = { [0] = { { itemID = 4232, stackCount = 12 }, { itemID = 783, stackCount = 7 } }, [1] = { { itemID = 4304, stackCount = 18 }, { itemID = 999999, stackCount = 1 } } }
C_Container = {
  GetContainerNumSlots = function(bag) return BAGS[bag] and #BAGS[bag] or 0 end,
  GetContainerItemInfo = function(bag, slot) return BAGS[bag] and BAGS[bag][slot] end,
}
local CACHED = { [4232] = true, [783] = true, [4304] = true }
C_Item = {
  GetItemInfo = function(id)
    if not CACHED[id] then return nil end
    return "Item" .. id, "link", 1, 25, 0, "Trade Goods", "Leather", 20, "", 134400, 7, 7, 6, 0
  end,
  RequestLoadItemDataByID = function(id) CACHED[id] = true end,
  GetItemNameByID = function(id) return "Item" .. id end,
  GetItemIconByID = function() return 1234 end,
}
-- Mail: one AH sale invoice.
function GetInboxNumItems() return 1 end
function GetInboxItem() return nil end
function GetInboxHeaderInfo() return nil, nil, "Auction House", "Auction successful: Medium Hide", 3036, 0, 29.5 end
function GetInboxInvoiceInfo() return "seller", "Medium Hide", "Someone", 0, 3200, 100, 160, 0, 0, 0, 10 end
Enum = { TooltipDataType = { Item = 0 } }
local tooltipHook
TooltipDataProcessor = { AddTooltipPostCall = function(_, fn) tooltipHook = fn end }
GameTooltip = setmetatable({ scripts = {}, events = {}, lines = {} }, Frame)
function GameTooltip:AddLine(t) table.insert(self.lines, t) end
function GameTooltip:AddDoubleLine(a, b) table.insert(self.lines, a .. " = " .. b) end
function TEST_TOOLTIP(id) GameTooltip.lines = {}; tooltipHook(GameTooltip, { id = id }); return GameTooltip.lines end
AuctionHouseFrame = setmetatable({ scripts = {}, events = {}, shown = true, SearchBar = { SearchBox = setmetatable({ scripts = {}, events = {} }, Frame) } }, Frame)
function AuctionHouseFrame.SearchBar:StartSearch() TEST_SEARCHED = AuctionHouseFrame.SearchBar.SearchBox.text end
Minimap = CreateFrame("Frame", "Minimap")
function Minimap:GetWidth() return 140 end
function Minimap:GetCenter() return 100, 100 end
function Minimap:GetEffectiveScale() return 1 end
function GetCursorPosition() return 150, 100 end
Settings = {
  RegisterCanvasLayoutCategory = function(frame, name) TEST_SETTINGS = { frame = frame, name = name }; return { GetID = function() return 42 end } end,
  RegisterAddOnCategory = function(cat) TEST_SETTINGS_REGISTERED = true end,
  OpenToCategory = function(id) TEST_SETTINGS_OPENED = id end,
}
