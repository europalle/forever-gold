-- Records what only the game knows, into ForeverGoldDB (written at logout and
-- /reload). Reads only: it never moves, sends, posts or buys anything.
local _, FG = ...

local function charKey()
  local name = UnitName("player")
  return name and FG.usable(name) and name or nil
end

local function me()
  local key = charKey()
  if not key or not FG.db then return nil end
  local c = FG.db.chars[key] or {}
  FG.db.chars[key] = c
  return c
end

local function snapshotPlayer()
  local c = me()
  if not c then return end
  c.realm = FG.try(GetNormalizedRealmName) or FG.try(GetRealmName)
  c.faction = FG.try(UnitFactionGroup, "player")
  c.class = select(2, FG.try(UnitClass, "player"))
  c.level = FG.try(UnitLevel, "player")
  c.money = FG.try(GetMoney)
  c.updated = time()
end

-- Professions, gathering included (TSM leaves those out).
local function snapshotProfessions()
  local c = me()
  if not c then return end
  local profs = {}
  local a, b, arch, fish, cook, firstAid = FG.try(GetProfessions)
  local found = false
  for _, idx in ipairs({ a or false, b or false, arch or false, fish or false, cook or false, firstAid or false }) do
    if idx then
      local name, _, lvl, max = FG.try(GetProfessionInfo, idx)
      if name then
        profs[name] = { lvl = lvl, max = max }
        found = true
      end
    end
  end
  if not found and GetNumSkillLines then
    -- Classic-style skill list, if the modern call is missing.
    for i = 1, (FG.try(GetNumSkillLines) or 0) do
      local name, isHeader, _, lvl, _, _, max = FG.try(GetSkillLineInfo, i)
      if name and not isHeader and max and max > 1 then profs[name] = { lvl = lvl, max = max } end
    end
  end
  c.profs = profs
end

local function countBags(bagIds)
  local counts = {}
  if not (C_Container and C_Container.GetContainerNumSlots) then return counts end
  for _, bag in ipairs(bagIds) do
    local slots = FG.try(C_Container.GetContainerNumSlots, bag) or 0
    for slot = 1, slots do
      local info = FG.try(C_Container.GetContainerItemInfo, bag, slot)
      if info and info.itemID and FG.usable(info.itemID) then
        counts[info.itemID] = (counts[info.itemID] or 0) + (info.stackCount or 1)
      end
    end
  end
  return counts
end

local function carriedBagIds()
  local ids = {}
  local last = NUM_TOTAL_EQUIPPED_BAG_SLOTS or ((NUM_BAG_SLOTS or 4) + (NUM_REAGENTBAG_SLOTS or 0))
  for i = 0, last do table.insert(ids, i) end
  return ids
end

local function bankBagIds()
  local ids = {}
  if C_Bank and C_Bank.FetchPurchasedBankTabIDs and Enum and Enum.BankType then
    local tabs = FG.try(C_Bank.FetchPurchasedBankTabIDs, Enum.BankType.Character)
    if type(tabs) == "table" and #tabs > 0 then
      for _, id in ipairs(tabs) do table.insert(ids, id) end
      return ids
    end
  end
  table.insert(ids, BANK_CONTAINER or -1)
  local first = (NUM_TOTAL_EQUIPPED_BAG_SLOTS or (NUM_BAG_SLOTS or 4)) + 1
  for i = first, first + (NUM_BANKBAGSLOTS or 7) - 1 do table.insert(ids, i) end
  return ids
end

local pendingBags = false
local function snapshotBags()
  pendingBags = false
  local c = me()
  if c then c.bags = countBags(carriedBagIds()) end
end

FG.on("PLAYER_LOGIN", function()
  snapshotPlayer()
  snapshotProfessions()
  snapshotBags()
end)
FG.on("PLAYER_MONEY", snapshotPlayer)
FG.on("PLAYER_LEVEL_UP", snapshotPlayer)
FG.on("SKILL_LINES_CHANGED", snapshotProfessions)
FG.on("BAG_UPDATE_DELAYED", function()
  if pendingBags then return end
  pendingBags = true
  C_Timer.After(1, snapshotBags)
end)
FG.on("PLAYER_LOGOUT", function()
  snapshotPlayer()
  snapshotBags()
end)

FG.on("BANKFRAME_OPENED", function()
  local c = me()
  if c then
    c.bank = countBags(bankBagIds())
    c.bankAt = time()
  end
end)

-- Mail: what is waiting, and sale invoices (the real cut and deposit).
local function readMail()
  local c = me()
  if not c or not GetInboxNumItems then return end
  local mail = {}
  local n = FG.try(GetInboxNumItems) or 0
  for i = 1, n do
    for a = 1, (ATTACHMENTS_MAX_RECEIVE or 16) do
      local _, itemID, _, count = FG.try(GetInboxItem, i, a)
      if itemID and FG.usable(itemID) then mail[itemID] = (mail[itemID] or 0) + (count or 1) end
    end
    local invoiceType, itemName, _, bid, buyout, deposit, consignment, _, _, _, count = FG.try(GetInboxInvoiceInfo, i)
    if invoiceType == "seller" and itemName then
      local _, _, _, _, money, _, daysLeft = FG.try(GetInboxHeaderInfo, i)
      -- Key by content so reopening the mailbox does not count a sale twice.
      local key = table.concat({ itemName, tostring(buyout), tostring(bid), tostring(deposit), tostring(consignment), tostring(count), tostring(daysLeft and math.floor(daysLeft * 24) or "") }, "|")
      if not FG.db.invoices[key] then
        FG.db.invoices[key] = { t = time(), char = charKey(), item = itemName, qty = count, buyout = buyout, bid = bid, deposit = deposit, cut = consignment, net = money }
      end
    end
  end
  c.mail = mail
  c.mailAt = time()
end
FG.on("MAIL_INBOX_UPDATE", readMail)
FG.on("MAIL_SHOW", readMail)

-- Your current auctions.
FG.on("OWNED_AUCTIONS_UPDATED", function()
  local c = me()
  if not c or not (C_AuctionHouse and C_AuctionHouse.GetNumOwnedAuctions) then return end
  local list = {}
  for i = 1, (FG.try(C_AuctionHouse.GetNumOwnedAuctions) or 0) do
    local a = FG.try(C_AuctionHouse.GetOwnedAuctionInfo, i)
    if a and a.itemKey and a.itemKey.itemID then
      table.insert(list, { id = a.itemKey.itemID, n = a.quantity, buyout = a.buyoutAmount, bid = a.bidAmount, left = a.timeLeftSeconds, sold = a.status == 1 or nil })
    end
  end
  c.auctions = list
  c.auctionsAt = time()
end)
FG.on("AUCTION_HOUSE_SHOW", function()
  if C_AuctionHouse and C_AuctionHouse.QueryOwnedAuctions then FG.try(C_AuctionHouse.QueryOwnedAuctions, {}) end
end)

-- Recipes with reagents, read when a profession window is open.
local recipeTimer
local function readRecipes()
  recipeTimer = nil
  local c = me()
  if not c or not (C_TradeSkillUI and C_TradeSkillUI.GetAllRecipeIDs) then return end
  local base = FG.try(C_TradeSkillUI.GetBaseProfessionInfo)
  local prof = base and base.professionName
  if not prof then return end
  local out = {}
  for _, id in ipairs(FG.try(C_TradeSkillUI.GetAllRecipeIDs) or {}) do
    local info = FG.try(C_TradeSkillUI.GetRecipeInfo, id)
    if info and info.learned then
      local s = FG.try(C_TradeSkillUI.GetRecipeSchematic, id, false)
      if s then
        local reag = {}
        for _, slot in ipairs(s.reagentSlotSchematics or {}) do
          local r = slot.reagents and slot.reagents[1]
          if r and r.itemID then table.insert(reag, { r.itemID, slot.quantityRequired or 1 }) end
        end
        local cd = FG.try(C_TradeSkillUI.GetRecipeCooldown, id)
        out[id] = { name = info.name, out = s.outputItemID, qty = s.quantityMin, reag = reag, cd = (cd and cd > 0) and math.floor(cd) or nil }
      end
    end
  end
  c.recipes = c.recipes or {}
  c.recipes[prof] = out
  c.recipesAt = time()
end
FG.on("TRADE_SKILL_LIST_UPDATE", function()
  if recipeTimer then return end
  recipeTimer = true
  C_Timer.After(1, readRecipes)
end)
FG.on("TRADE_SKILL_SHOW", function() C_Timer.After(1, readRecipes) end)
