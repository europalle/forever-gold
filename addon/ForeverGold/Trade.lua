-- Crafting, shopping, the mailbox list, disenchant values and the undercut
-- check. All of it reads and lists; nothing is crafted, bought, mailed or
-- cancelled for you.
local _, FG = ...

FG.picks = {} -- output item id -> true: crafts picked for the shopping list

local function info(id)
  local i = FG.db and FG.db.items and FG.db.items[id]
  if i and i.c then return i.q, i.c, i.s, i.rl, i.il end
  local _, _, q, il, rl, _, _, _, _, _, _, c, s = FG.try(GetItemInfo, id)
  return q, c, s, rl, il
end

local function price(id)
  local now = FG.priceNow(id)
  return now
end

-- How many of a craft the reagents on this character cover.
function FG.canMake(craft)
  local n
  for _, r in ipairs(craft.r or {}) do
    local here = FG.owned(r[1])
    local k = math.floor(here / math.max(1, r[2]))
    if not n or k < n then n = k end
  end
  return n or 0
end

function FG.crafts()
  local d = FG.data()
  return d and d.craft or {}
end

-- The shopping list for the picked crafts: what is missing for `batch` of each,
-- with the most you can pay before the craft stops paying.
function FG.shopping()
  local d = FG.data()
  local batch = FG.db and FG.db.settings.batch or 5
  local need, order = {}, {}
  for _, c in ipairs(FG.crafts()) do
    if FG.picks[c.o] then
      for _, r in ipairs(c.r or {}) do
        local id, qty = r[1], r[2]
        local e = need[id]
        if not e then
          e = { id = id, qty = 0 }
          need[id] = e
          table.insert(order, e)
        end
        e.qty = e.qty + qty * batch
        local p = price(id)
        local max = p and math.floor(p * (c.be or 1))
        if max and (not e.max or max < e.max) then e.max = max end
      end
    end
  end
  local out = {}
  for _, e in ipairs(order) do
    local here, others = FG.owned(e.id)
    e.have = here + others
    e.buy = math.max(0, e.qty - e.have)
    e.vendor = d and d.vend and d.vend[e.id]
    if e.buy > 0 then table.insert(out, e) end
  end
  return out
end

-- A search for TSM's Shopping tab: "Name/exact/x12/1g50s;..." (vendor items left out).
local function coins(c)
  local g, s, k = math.floor(c / 10000), math.floor(c % 10000 / 100), c % 100
  return (g > 0 and (g .. "g") or "") .. (s > 0 and (s .. "s") or "") .. ((k > 0 or (g == 0 and s == 0)) and (k .. "c") or "")
end
function FG.shoppingString()
  local parts = {}
  for _, e in ipairs(FG.shopping()) do
    local p = price(e.id)
    if not (e.vendor and p and e.vendor <= p) then
      local name = FG.itemName and FG.itemName(e.id) or tostring(e.id)
      table.insert(parts, name .. "/exact/x" .. e.buy .. (e.max and ("/" .. coins(e.max)) or ""))
    end
  end
  return table.concat(parts, ";")
end

-- ---- Disenchant value ----
local function bracket(level)
  if level <= 10 then return "1-10" end
  local lo = math.floor((level - 1) / 5) * 5 + 1
  return lo .. "-" .. (lo + 4)
end

-- Expected value of disenchanting an item, and where the figure comes from:
-- the guild's recorded disenchants when there are five or more, else TSM's.
function FG.disenchantValue(id)
  local q, c, _, rl, il = info(id)
  if not q or q < 2 or q > 4 or (c ~= 2 and c ~= 4) then return nil end
  local level = (rl and rl > 0 and rl) or il
  local d = FG.data()
  if level and d and d.de then
    local e = d.de[q .. "|" .. (c == 2 and "weapon" or "armor") .. "|" .. bracket(level)]
    if e and (e.n or 0) >= 5 and (e.v or 0) > 0 then return e.v, "guild", e.n end
  end
  if TSM_API and TSM_API.GetCustomPriceValue then
    local v = FG.try(TSM_API.GetCustomPriceValue, "Destroy", "i:" .. id)
    if type(v) == "number" and v > 0 then return v, "TSM" end
  end
  return nil
end

-- ---- Mailbox list ----
local KEEP_FOOD = 20 -- cooking materials stay on a hunter for the pet

-- What in your bags is worth sending to the bank alt: materials with a price,
-- and uncommon or better gear with its disenchant value against its price.
function FG.mailList()
  local d = FG.data()
  local me = FG.db and FG.db.chars[FG.playerName() or ""]
  local out = {}
  if not (d and me) then return out end
  local hunter = me.class == "HUNTER"
  for id, n in pairs(me.bags or {}) do
    local q, c, s = info(id)
    local p = price(id)
    local row
    if c == 7 and p then
      local send = n
      if hunter and s == 8 then send = math.max(0, n - KEEP_FOOD) end
      if send > 0 then row = { id = id, n = send, value = p * send, sub = (send < n) and ("keep " .. (n - send) .. " for the pet") or "material" } end
    elseif (c == 2 or c == 4) and q and q >= 2 then
      local de, src = FG.disenchantValue(id)
      if de or p then
        local sell = p and p * (1 - (d.cut or 0.05)) or 0
        local better = de and de > sell
        row = { id = id, n = n, value = math.max(de or 0, sell) * n, de = de, sell = p, sub = better and ("Disenchant, " .. (src or "") .. " value") or (p and "Sell" or "Disenchant") }
      end
    end
    if row then table.insert(out, row) end
  end
  table.sort(out, function(a, b) return a.value > b.value end)
  return out
end

-- ---- Undercut check ----
local lastUndercut = 0
function FG.undercuts()
  local me = FG.db and FG.db.chars[FG.playerName() or ""]
  local out, seen = {}, {}
  for _, a in ipairs(me and me.auctions or {}) do
    if a.id and a.buyout and a.buyout > 0 and not a.sold and not seen[a.id] then
      local unit = a.buyout -- commodities and single items: the buyout is per unit
      local now = price(a.id)
      if now and now < unit then
        seen[a.id] = true
        table.insert(out, { id = a.id, mine = unit, now = now, by = 1 - now / unit })
      end
    end
  end
  table.sort(out, function(a, b) return a.by > b.by end)
  return out
end

local function reportUndercuts()
  if not (FG.db and FG.db.settings.chat) then return end
  if time() - lastUndercut < 120 then return end
  local list = FG.undercuts()
  if #list == 0 then return end
  lastUndercut = time()
  FG.print(FG.WARN .. #list .. (#list == 1 and " auction undercut:" or " auctions undercut:") .. FG.R)
  for i = 1, math.min(5, #list) do
    local u = list[i]
    FG.print("  " .. (FG.itemName and FG.itemName(u.id) or u.id) .. ": yours " .. FG.money(u.mine) .. ", cheapest " .. FG.money(u.now) .. FG.MUTED .. " (-" .. math.floor(u.by * 100 + 0.5) .. "%)" .. FG.R)
  end
end
FG.on("OWNED_AUCTIONS_UPDATED", function()
  if C_Timer then C_Timer.After(0.5, reportUndercuts) else reportUndercuts() end
end)
