-- Records game data as you play, for the site to learn from: what you loot,
-- skin, gather and disenchant (and from what), what vendors sell and for how
-- much, and what trainers teach and charge. It only listens to what the game
-- already shows you; it never clicks, buys or casts anything.
local _, FG = ...

local MAX_LOOT = 3000
local MAX_VENDORS = 400
local MAX_TRAINERS = 100

-- Gathering and disenchanting, matched by spell ID so any client language works.
local SPELL_KINDS = {
  { "skin", { 8613, 8617, 8618, 10768, 32678 } },
  { "herb", { 2366, 2368, 3570, 11993 } },
  { "mine", { 2575, 2576, 3564, 10248 } },
  { "fish", { 7620, 7731, 7732, 18248 } },
  { "disenchant", { 13262 } },
}
local kindByName

local function spellName(id)
  if C_Spell and C_Spell.GetSpellName then return FG.try(C_Spell.GetSpellName, id) end
  return FG.try(GetSpellInfo, id)
end

local function kindOf(spellID)
  if not kindByName then
    kindByName = {}
    for _, k in ipairs(SPELL_KINDS) do
      for _, id in ipairs(k[2]) do
        local n = spellName(id)
        if n then kindByName[n] = k[1] end
      end
    end
  end
  for _, k in ipairs(SPELL_KINDS) do
    for _, id in ipairs(k[2]) do
      if id == spellID then return k[1] end
    end
  end
  local n = spellID and spellName(spellID)
  return n and kindByName[n] or nil
end

local function itemIdFromLink(link)
  return link and FG.usable(link) and tonumber(link:match("item:(%d+)")) or nil
end

-- "Creature-0-1234-0-56-<npcId>-<spawn>": the NPC id, if the client shows it.
local function npcId(guid)
  if not guid or not FG.usable(guid) then return nil end
  local kind, _, _, _, _, id = strsplit("-", guid)
  if kind == "Creature" or kind == "Vehicle" then return tonumber(id) end
  return nil
end

local function mapId()
  return C_Map and C_Map.GetBestMapForUnit and FG.try(C_Map.GetBestMapForUnit, "player") or nil
end

-- Uncommon-or-better gear in the bags, by item ID, for working out which item
-- a disenchant used up.
local function gearCounts()
  local counts = {}
  if not (C_Container and C_Container.GetContainerNumSlots) then return counts end
  local last = NUM_TOTAL_EQUIPPED_BAG_SLOTS or 4
  for bag = 0, last do
    for slot = 1, (FG.try(C_Container.GetContainerNumSlots, bag) or 0) do
      local info = FG.try(C_Container.GetContainerItemInfo, bag, slot)
      if info and info.itemID and FG.usable(info.itemID) and (info.quality or 0) >= 2 then
        counts[info.itemID] = (counts[info.itemID] or 0) + (info.stackCount or 1)
      end
    end
  end
  return counts
end

local cast = nil -- { kind, at, before = gear counts when a disenchant started }

FG.on("UNIT_SPELLCAST_START", function(_, unit, _, spellID)
  if unit ~= "player" then return end
  local kind = kindOf(spellID)
  if kind then cast = { kind = kind, at = GetTime(), before = kind == "disenchant" and gearCounts() or nil } end
end)

FG.on("UNIT_SPELLCAST_SUCCEEDED", function(_, unit, _, spellID)
  if unit ~= "player" then return end
  local kind = kindOf(spellID)
  if kind then
    cast = cast and cast.kind == kind and cast or { kind = kind }
    cast.at = GetTime()
    cast.done = true
  end
end)

local lastKey, lastKeyAt

FG.on("LOOT_OPENED", function()
  if not FG.db or not GetNumLootItems then return end
  local n = FG.try(GetNumLootItems) or 0
  if n == 0 then return end
  local recent = cast and cast.done and GetTime() - (cast.at or 0) < 5
  local kind = recent and cast.kind or "loot"
  local ev = { t = time(), k = kind, m = mapId(), i = {} }
  local sources = {}
  for slot = 1, n do
    local id = itemIdFromLink(FG.try(GetLootSlotLink, slot))
    local _, _, qty = FG.try(GetLootSlotInfo, slot)
    if id then
      table.insert(ev.i, { id, qty or 1 })
      if FG.queueItem then FG.queueItem(id) end
    end
    if GetLootSourceInfo then
      local guid = FG.try(GetLootSourceInfo, slot)
      local npc = npcId(guid)
      if npc then sources[npc] = true end
    end
  end
  if #ev.i == 0 then return end
  local npcs = {}
  for id in pairs(sources) do table.insert(npcs, id) end
  if #npcs == 1 then ev.npc = npcs[1] elseif #npcs > 1 then ev.npcs = npcs end
  if ev.npc and UnitGUID and npcId(FG.try(UnitGUID, "target")) == ev.npc then
    ev.lvl = FG.try(UnitLevel, "target")
    local nm = FG.try(UnitName, "target")
    if nm and FG.usable(nm) then ev.nm = nm end
  end
  if kind == "disenchant" and cast.before then
    local now = gearCounts()
    for id, c in pairs(cast.before) do
      if (now[id] or 0) < c then ev.src = id break end
    end
    if ev.src and FG.queueItem then FG.queueItem(ev.src) end
  end
  -- The loot window can open twice for one corpse; record it once.
  local key = kind .. ":" .. tostring(ev.npc) .. ":" .. #ev.i .. ":" .. tostring(ev.i[1][1])
  if key == lastKey and lastKeyAt and time() - lastKeyAt < 30 and kind == "loot" then return end
  lastKey, lastKeyAt = key, time()
  if kind ~= "loot" then cast = nil end
  FG.db.loot = FG.db.loot or {}
  table.insert(FG.db.loot, ev)
  while #FG.db.loot > MAX_LOOT do table.remove(FG.db.loot, 1) end
end)

-- Vendors: what they sell, for how much, in what stack, how many in stock.
local function readMerchant()
  if not FG.db or not GetMerchantNumItems then return end
  local npc = npcId(FG.try(UnitGUID, "npc"))
  if not npc then return end
  local items = {}
  for i = 1, (FG.try(GetMerchantNumItems) or 0) do
    local id = FG.try(GetMerchantItemID, i) or itemIdFromLink(FG.try(GetMerchantItemLink, i))
    if id then
      local price, stack, avail, extended
      local info = C_MerchantFrame and C_MerchantFrame.GetItemInfo and FG.try(C_MerchantFrame.GetItemInfo, i)
      if type(info) == "table" then
        price, stack, avail, extended = info.price, info.stackCount, info.numAvailable, info.hasExtendedCost
      else
        local _, _, p, q, a, _, _, x = FG.try(GetMerchantItemInfo, i)
        price, stack, avail, extended = p, q, a, x
      end
      items[id] = { p = price, q = stack, n = avail, x = extended and 1 or nil }
      if FG.queueItem then FG.queueItem(id) end
    end
  end
  FG.db.vendors = FG.db.vendors or {}
  FG.db.vendors[npc] = { name = FG.try(UnitName, "npc"), m = mapId(), t = time(), items = items }
  local n = 0
  for _ in pairs(FG.db.vendors) do n = n + 1 end
  if n > MAX_VENDORS then
    local oldest, oldestT
    for id, v in pairs(FG.db.vendors) do
      if not oldestT or (v.t or 0) < oldestT then oldest, oldestT = id, v.t or 0 end
    end
    FG.db.vendors[oldest] = nil
  end
end
FG.on("MERCHANT_SHOW", function() C_Timer.After(0.5, readMerchant) end)
FG.on("MERCHANT_UPDATE", function() C_Timer.After(0.5, readMerchant) end)

-- Trainers: what they teach, at what skill and level, and what it costs.
local function readTrainer()
  if not FG.db or not GetNumTrainerServices then return end
  local npc = npcId(FG.try(UnitGUID, "npc"))
  if not npc then return end
  local services = {}
  for i = 1, math.min(FG.try(GetNumTrainerServices) or 0, 400) do
    local name, _, category = FG.try(GetTrainerServiceInfo, i)
    if name and category ~= "header" then
      local cost = FG.try(GetTrainerServiceCost, i)
      local skill, skillLevel = FG.try(GetTrainerServiceSkillReq, i)
      local level = GetTrainerServiceLevelReq and FG.try(GetTrainerServiceLevelReq, i)
      local item = itemIdFromLink(GetTrainerServiceItemLink and FG.try(GetTrainerServiceItemLink, i))
      table.insert(services, { n = name, c = cost, sk = skill, s = skillLevel, l = level, item = item, st = category })
      if item and FG.queueItem then FG.queueItem(item) end
    end
  end
  FG.db.trainers = FG.db.trainers or {}
  FG.db.trainers[npc] = { name = FG.try(UnitName, "npc"), m = mapId(), t = time(), services = services }
  local n = 0
  for _ in pairs(FG.db.trainers) do n = n + 1 end
  if n > MAX_TRAINERS then
    for id in pairs(FG.db.trainers) do
      if id ~= npc then FG.db.trainers[id] = nil break end
    end
  end
end
FG.on("TRAINER_SHOW", function() C_Timer.After(0.5, readTrainer) end)
FG.on("TRAINER_UPDATE", function() C_Timer.After(0.5, readTrainer) end)
