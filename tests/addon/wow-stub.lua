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
local clock = 1000
function GetTime() return clock end
function TEST_TICK(s) clock = clock + s end
function strsplit(sep, s) local out = {} for part in string.gmatch(s, "([^" .. sep .. "]+)") do table.insert(out, part) end return unpack(out) end
C_Spell = { GetSpellName = function(id) return ({ [8613] = "Skinning", [13262] = "Disenchant", [2366] = "Herb Gathering" })[id] end }
C_Map = { GetBestMapForUnit = function() return 1426 end }
TEST_LOOT = {}
function GetNumLootItems() return #TEST_LOOT end
function GetLootSlotLink(i) return "|Hitem:" .. TEST_LOOT[i][1] .. "::|h[x]|h" end
function GetLootSlotInfo(i) return 0, "x", TEST_LOOT[i][2] end
function GetLootSourceInfo(i) return TEST_LOOT_GUID end
local target = nil
function UnitGUID(u) if u == "npc" then return TEST_NPC_GUID end if u == "target" then return target end end
function TEST_TARGET(g) target = g end
local oldLevel = UnitLevel
function UnitLevel(u) if u == "target" then return 34 end return oldLevel(u) end
function UnitName(u) if u == "npc" then return "Test Vendor" end if u == "target" then return "Plainstrider" end return "Bubbi" end
TEST_MERCHANT = { { 4289, 50, 5, -1 }, { 2320, 10, 1, -1 }, { 2321, 100, 1, 3 } }
function GetMerchantNumItems() return #TEST_MERCHANT end
function GetMerchantItemID(i) return TEST_MERCHANT[i][1] end
function GetMerchantItemInfo(i) local m = TEST_MERCHANT[i]; return "x", 0, m[2], m[3], m[4], true, true, nil end
TEST_TRAINER = { { "Apprentice Leatherworking", "available", 10, "Leatherworking", 0, 5 }, { "Cured Heavy Hide", "unavailable", 2000, "Leatherworking", 150, 4236 } }
function GetNumTrainerServices() return #TEST_TRAINER end
function GetTrainerServiceInfo(i) return TEST_TRAINER[i][1], nil, TEST_TRAINER[i][2] end
function GetTrainerServiceCost(i) return TEST_TRAINER[i][3] end
function GetTrainerServiceSkillReq(i) return TEST_TRAINER[i][4], TEST_TRAINER[i][5], true end
function GetTrainerServiceLevelReq() return 10 end
function GetTrainerServiceItemLink(i) return "|Hitem:" .. TEST_TRAINER[i][6] .. "::|h[x]|h" end
PlayerName = setmetatable({ scripts = {}, events = {}, text = "Bubbi Hunter" }, getmetatable(UIParent))
TEST_BROWSE = {}
TEST_COMMODITY = {}
TEST_REPLICATE = {}
C_AuctionHouse = C_AuctionHouse or {}
C_AuctionHouse.GetBrowseResults = function() return TEST_BROWSE end
C_AuctionHouse.GetNumCommoditySearchResults = function(id) return #(TEST_COMMODITY[id] or {}) end
C_AuctionHouse.GetCommoditySearchResultInfo = function(id, i) local r = (TEST_COMMODITY[id] or {})[i]; return r and { unitPrice = r[1], quantity = r[2] } end
C_AuctionHouse.GetNumItemSearchResults = function(key) return 2 end
C_AuctionHouse.GetItemSearchResultInfo = function(key, i) return ({ { buyoutAmount = 9000, quantity = 1 }, { buyoutAmount = 7000, quantity = 1 } })[i] end
C_AuctionHouse.GetNumReplicateItems = function() return #TEST_REPLICATE end
C_AuctionHouse.GetReplicateItemInfo = function(i) local r = TEST_REPLICATE[i + 1]; return "x", 0, r[2], 1, true, 1, nil, 0, 0, r[3], 0, false, nil, nil, nil, 0, r[1], true end
