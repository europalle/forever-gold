-- Looks up item details (level, type, quality) for the items the site asks
-- about, a few per second, and saves them for the helper to upload.
local _, FG = ...

local queue, qi = {}, 1
local PER_TICK = 20 -- items per tick, a tick every 0.5 s

local function getInfo(id)
  local f = (C_Item and C_Item.GetItemInfo) or GetItemInfo
  local name, _, quality, itemLevel, reqLevel, _, _, maxStack, equipLoc, _, sellPrice, classID, subclassID, bindType = FG.try(f, id)
  if not name then return nil end
  return { n = name, q = quality, il = itemLevel, rl = reqLevel, c = classID, s = subclassID, e = (equipLoc ~= "" and equipLoc) or nil, v = sellPrice, st = maxStack, b = bindType }
end

local function remember(id)
  local info = getInfo(id)
  if info then
    FG.db.items[id] = info
    return true
  end
  -- Not in the client's cache yet: ask for it and retry later in the queue.
  if C_Item and C_Item.RequestLoadItemDataByID then FG.try(C_Item.RequestLoadItemDataByID, id) end
  return false
end

local ticker
local tries = {}
local function tick()
  local done = 0
  while qi <= #queue and done < PER_TICK do
    local id = queue[qi]
    qi = qi + 1
    done = done + 1
    if not FG.db.items[id] and not remember(id) then
      -- Not cached yet: the request above loads it; try again later, twice at most.
      tries[id] = (tries[id] or 0) + 1
      if tries[id] < 3 then table.insert(queue, id) end
    end
  end
  if qi > #queue and ticker then
    ticker:Cancel()
    ticker = nil
  end
end

-- Anything the addon sees (loot, vendors, trainers) can ask for details.
function FG.queueItem(id)
  if type(id) ~= "number" or not FG.db or FG.db.items[id] then return end
  table.insert(queue, id)
  if not ticker and C_Timer then ticker = C_Timer.NewTicker(0.5, tick) end
end

FG.on("PLAYER_LOGIN", function()
  if not C_Timer then return end
  local d = FG.data()
  local seen = {}
  for _, id in ipairs(d and type(d.want) == "table" and d.want or {}) do
    if type(id) == "number" and not FG.db.items[id] and not seen[id] then
      seen[id] = true
      table.insert(queue, id)
    end
  end
  -- Also anything in the bags, so the site learns what you carry.
  for _, ch in pairs(FG.db.chars) do
    for id in pairs(ch.bags or {}) do
      if not FG.db.items[id] and not seen[id] then
        seen[id] = true
        table.insert(queue, id)
      end
    end
  end
  if #queue > 0 then
    -- Start after the login rush.
    C_Timer.After(10, function() ticker = C_Timer.NewTicker(0.5, tick) end)
  end
end)

FG.on("GET_ITEM_INFO_RECEIVED", function(_, id, ok)
  if ok and type(id) == "number" and FG.db and not FG.db.items[id] then remember(id) end
end)
