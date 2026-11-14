-- The auction house panel: Sell, Make, Buy, Hold. A row click runs one search
-- in the auction house; posting and buying stay with you (or TSM).
local _, FG = ...

-- Calls a frame method if this client has it.
local function call(obj, method, ...)
  if obj and type(obj[method]) == "function" then return FG.try(obj[method], obj, ...) end
end

local ROWS, ROW_H = 9, 36
local TABS = { "signals", "sell", "craft", "shop", "buy", "mail" }
local TAB_LABEL = { signals = "Signals", sell = "Sell", craft = "Craft", shop = "Shop", buy = "Buy", mail = "Mail" }
local state = { tab = "signals", offset = 0, rows = {}, autoShown = false }

function FG.itemName(id)
  local n = C_Item and C_Item.GetItemNameByID and FG.try(C_Item.GetItemNameByID, id)
  if not n then
    n = FG.try(GetItemInfo, id)
    if not n and C_Item and C_Item.RequestLoadItemDataByID then FG.try(C_Item.RequestLoadItemDataByID, id) end
  end
  return n or ("item " .. id)
end
local itemName = FG.itemName

local function itemIcon(id)
  return (C_Item and C_Item.GetItemIconByID and FG.try(C_Item.GetItemIconByID, id)) or 134400 -- question mark
end

local function haveCount(id)
  local here = FG.owned(id)
  return here
end

-- " x12" on this character, " x12 on alts" when only alts have it.
local function haveText(id)
  local here, others = FG.owned(id)
  if here > 0 then return FG.MUTED .. " x" .. here .. FG.R end
  if others > 0 then return FG.MUTED .. " x" .. others .. " on alts" .. FG.R end
  return ""
end

function FG.search(name)
  local ah = _G.AuctionHouseFrame
  if not (ah and ah:IsShown() and ah.SearchBar and ah.SearchBar.SearchBox) then
    FG.print("Open the auction house to search for " .. name .. ".")
    return
  end
  if ah.SetDisplayMode and AuctionHouseFrameDisplayMode then FG.try(ah.SetDisplayMode, ah, AuctionHouseFrameDisplayMode.Buy) end
  ah.SearchBar.SearchBox:SetText(name)
  if ah.SearchBar.StartSearch then FG.try(ah.SearchBar.StartSearch, ah.SearchBar) end
end

-- Rows for the current tab: { id, title, sub, right, rightSub }
local function buildRows()
  local d = FG.data()
  local out = {}
  if not d then return out end
  local l = d.lists or {}
  local calls = d.calls or {}
  if state.tab == "signals" then
    -- Strongest calls on what you have, then strong buys you can afford.
    for _, id in ipairs(d.alerts or {}) do
      local s = d.sig and d.sig[id]
      if s then
        local now = FG.priceNow(id)
        table.insert(out, {
          id = id,
          title = itemName(id) .. haveText(id),
          sub = FG.signalText(s),
          right = FG.money(now),
          rightSub = s.f and ("usual " .. FG.money(s.f)) or "",
        })
      end
    end
  elseif state.tab == "sell" then
    -- Only what you have: the site calls many items a sell, but you can only
    -- post what is in your bags, bank or mail (this character first).
    local mine, rest = {}, {}
    for _, id in ipairs(FG.ownedOnly(l.sell)) do
      local c = calls[id] or {}
      local n = haveCount(id)
      -- A live price from your own auction house browsing beats the advice's.
      local now, live = FG.priceNow(id)
      local price = live and now or c.pr
      local net = live and now and now * (1 - (d.cut or 0.05)) or c.g
      local row = {
        id = id,
        title = itemName(id) .. haveText(id),
        sub = live and ("Live price. " .. (c.t or "")) or (c.t or ""),
        right = FG.money(price),
        rightSub = net and ("nets " .. FG.money(n > 0 and net * n or net)) or "",
      }
      table.insert(n > 0 and mine or rest, row)
    end
    for _, r in ipairs(mine) do table.insert(out, r) end
    for _, r in ipairs(rest) do table.insert(out, r) end
    for _, id in ipairs(FG.ownedOnly(l.hold)) do
      local c = calls[id] or {}
      table.insert(out, { id = id, title = itemName(id) .. haveText(id), sub = FG.WARN .. "Hold. " .. FG.R .. (c.t or ""), right = "", rightSub = "" })
    end
  elseif state.tab == "craft" then
    -- Raw materials worth turning into something first, then learned recipes
    -- that pay. Click a recipe to put it on the shopping list.
    for _, m in ipairs(FG.ownedOnly(l.make)) do
      local n = haveCount(m.id)
      table.insert(out, { id = m.id, title = (m.vb or "Make") .. " " .. itemName(m.id) .. haveText(m.id), sub = "Makes " .. itemName(m.o), right = FG.GOOD .. "+" .. FG.R .. FG.money(m.g), rightSub = n > 0 and ("+" .. FG.money(m.g * n) .. " total") or "each" })
    end
    for _, c in ipairs(FG.crafts()) do
      local can = FG.canMake(c)
      local parts = {}
      for _, r in ipairs(c.r or {}) do table.insert(parts, r[2] .. " " .. itemName(r[1])) end
      table.insert(out, {
        id = c.o,
        pick = c.o,
        title = (FG.picks[c.o] and (FG.GOLD .. "+ " .. FG.R) or "") .. itemName(c.o) .. (can > 0 and (FG.GOOD .. "  make " .. can .. FG.R) or ""),
        sub = table.concat(parts, ", "),
        right = FG.GOOD .. "+" .. FG.R .. FG.money(c.g),
        rightSub = can > 0 and ("+" .. FG.money(c.g * can) .. " now") or "each",
      })
    end
  elseif state.tab == "shop" then
    for _, e in ipairs(FG.shopping()) do
      local p = FG.priceNow(e.id)
      local atVendor = e.vendor and p and e.vendor <= p
      table.insert(out, {
        id = e.id,
        title = itemName(e.id) .. FG.MUTED .. " x" .. e.buy .. FG.R,
        sub = atVendor and ("Vendor sells it for " .. FG.money(e.vendor)) or ("Have " .. e.have .. " of " .. e.qty),
        right = FG.money(atVendor and e.vendor or p),
        rightSub = (not atVendor and e.max) and ("pay up to " .. FG.money(e.max)) or "",
      })
    end
  elseif state.tab == "buy" then
    for _, b in ipairs(l.buy or {}) do
      table.insert(out, { id = b.id, title = itemName(b.id), sub = "Usual " .. FG.money(b.u) .. ". Check the exact item first.", right = FG.money(b.pr), rightSub = "+" .. FG.money(b.g) .. " each" })
    end
  else
    for _, m in ipairs(FG.mailList()) do
      table.insert(out, {
        id = m.id,
        title = itemName(m.id) .. FG.MUTED .. " x" .. m.n .. FG.R,
        sub = m.de and (m.sub .. ": " .. FG.money(m.de) .. " against " .. FG.money(m.sell)) or m.sub,
        right = FG.money(m.value),
        rightSub = "",
      })
    end
  end
  return out
end

local panel

local refresh
function FG.refreshPanel() if refresh then refresh() end end

function refresh()
  if not panel or not panel:IsShown() then return end
  local d = FG.data()
  panel.sub:SetText(d and string.format("Advice from %s ago · %s", FG.ago(d.generatedAt), d.user or "") or "No advice yet: start the helper, then /reload.")
  local rows = buildRows()
  state.rows = rows
  local max = math.max(0, #rows - ROWS)
  if state.offset > max then state.offset = max end
  local l = d and d.lists or {}
  for _, key in ipairs(TABS) do
    local b = panel.tabs[key]
    local count
    if key == state.tab then count = #rows
    elseif key == "signals" then count = #(d and d.alerts or {})
    elseif key == "sell" then count = #FG.ownedOnly(l.sell) + #FG.ownedOnly(l.hold)
    elseif key == "craft" then count = #FG.ownedOnly(l.make) + #FG.crafts()
    elseif key == "shop" then count = #FG.shopping()
    elseif key == "buy" then count = #(l.buy or {})
    else count = nil end
    b:SetText(TAB_LABEL[key] .. (count and count > 0 and (" " .. count) or ""))
    if key == state.tab then b:LockHighlight() else b:UnlockHighlight() end
  end
  for i = 1, ROWS do
    local r, row = rows[i + state.offset], panel.rows[i]
    if r then
      row.data = r
      row.icon:SetTexture(itemIcon(r.id))
      row.title:SetText(r.title)
      row.sub:SetText(r.sub)
      row.right:SetText(r.right)
      row.rightSub:SetText(r.rightSub)
      row:Show()
    else
      row.data = nil
      row:Hide()
    end
  end
  local EMPTY = {
    craft = "No learned recipe pays right now. Open your profession windows so the addon reads them.",
    shop = "Click recipes on the Craft tab to build a shopping list.",
    mail = "Nothing in your bags worth sending.",
  }
  panel.note:SetText(state.tab == "craft" and "Click a recipe to add it to the Shop tab." or state.tab == "shop" and ("For " .. (FG.db and FG.db.settings.batch or 5) .. " of each picked recipe. /fg batch N changes it.") or state.tab == "mail" and ("Worth sending" .. (d and d.bank and (" to " .. d.bank) or "") .. ". You attach and send.") or "Click a row to search for it. You post and buy.")
  if panel.copy then panel.copy:SetShown(state.tab == "shop" and #rows > 0) end
  panel.empty:SetText(EMPTY[state.tab] or state.tab == "buy" and "No deals right now." or state.tab == "signals" and "No strong signals right now. Most of the time the right trade is none." or "Nothing of yours here. Your bags, bank and mail count.")
  panel.empty:SetShown(#rows == 0)
  panel.more:SetText(#rows > ROWS and string.format("%d-%d of %d · scroll for more", state.offset + 1, math.min(#rows, state.offset + ROWS), #rows) or "")
end

local function create()
  panel = CreateFrame("Frame", "ForeverGoldPanel", UIParent, "BackdropTemplate")
  panel:SetSize(360, 120 + ROWS * ROW_H)
  panel:SetPoint("CENTER")
  panel:SetFrameStrata("HIGH")
  panel:SetBackdrop({
    bgFile = "Interface\\DialogFrame\\UI-DialogBox-Background",
    edgeFile = "Interface\\DialogFrame\\UI-DialogBox-Border",
    tile = true, tileSize = 32, edgeSize = 32,
    insets = { left = 11, right = 12, top = 12, bottom = 11 },
  })
  panel:SetMovable(true)
  panel:EnableMouse(true)
  panel:RegisterForDrag("LeftButton")
  panel:SetScript("OnDragStart", panel.StartMoving)
  panel:SetScript("OnDragStop", function(self)
    self:StopMovingOrSizing()
    -- Remember where you put it; /fg dock forgets.
    local point, _, rel, x, y = call(self, "GetPoint", 1)
    if point and FG.db then FG.db.settings.panelPos = { point, rel or point, x or 0, y or 0 } end
  end)
  call(panel, "SetClampedToScreen", true)
  panel:Hide()
  table.insert(UISpecialFrames, "ForeverGoldPanel") -- Escape closes it

  local title = panel:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
  title:SetPoint("TOPLEFT", 20, -18)
  title:SetText("Forever Gold")
  panel.sub = panel:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
  panel.sub:SetPoint("TOPLEFT", title, "BOTTOMLEFT", 0, -4)
  local close = CreateFrame("Button", nil, panel, "UIPanelCloseButton")
  close:SetPoint("TOPRIGHT", -6, -6)

  panel.tabs = {}
  local prev
  for _, key in ipairs(TABS) do
    local b = CreateFrame("Button", nil, panel, "UIPanelButtonTemplate")
    b:SetSize(53, 22)
    if prev then b:SetPoint("LEFT", prev, "RIGHT", 2, 0) else b:SetPoint("TOPLEFT", 14, -58) end
    b:SetScript("OnClick", function()
      state.tab = key
      state.offset = 0
      refresh()
    end)
    panel.tabs[key] = b
    prev = b
  end

  panel.rows = {}
  for i = 1, ROWS do
    local row = CreateFrame("Button", nil, panel)
    row:SetSize(324, ROW_H - 2)
    row:SetPoint("TOPLEFT", 18, -86 - (i - 1) * ROW_H)
    row:SetHighlightTexture("Interface\\QuestFrame\\UI-QuestTitleHighlight", "ADD")
    row.icon = row:CreateTexture(nil, "ARTWORK")
    row.icon:SetSize(28, 28)
    row.icon:SetPoint("LEFT", 2, 0)
    row.title = row:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
    row.title:SetPoint("TOPLEFT", row.icon, "TOPRIGHT", 6, -1)
    row.title:SetPoint("RIGHT", row, "RIGHT", -90, 0)
    row.title:SetJustifyH("LEFT")
    row.title:SetWordWrap(false)
    row.sub = row:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
    row.sub:SetPoint("BOTTOMLEFT", row.icon, "BOTTOMRIGHT", 6, 1)
    row.sub:SetPoint("RIGHT", row, "RIGHT", -90, 0)
    row.sub:SetJustifyH("LEFT")
    row.sub:SetWordWrap(false)
    row.right = row:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
    row.right:SetPoint("TOPRIGHT", -2, -1)
    row.rightSub = row:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
    row.rightSub:SetPoint("BOTTOMRIGHT", -2, 1)
    row:SetScript("OnClick", function(self)
      if not self.data then return end
      if self.data.pick then
        -- A recipe: on or off the shopping list.
        FG.picks[self.data.pick] = not FG.picks[self.data.pick] or nil
        refresh()
      else
        FG.search(itemName(self.data.id))
      end
    end)
    row:SetScript("OnEnter", function(self)
      if not self.data then return end
      GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
      FG.try(GameTooltip.SetItemByID, GameTooltip, self.data.id)
      GameTooltip:Show()
    end)
    row:SetScript("OnLeave", function() GameTooltip:Hide() end)
    panel.rows[i] = row
  end
  panel:EnableMouseWheel(true)
  panel:SetScript("OnMouseWheel", function(_, delta)
    state.offset = math.max(0, state.offset - delta)
    refresh()
  end)

  panel.empty = panel:CreateFontString(nil, "OVERLAY", "GameFontDisable")
  panel.empty:SetPoint("TOP", 0, -110)
  panel.empty:SetText("Nothing here right now.")
  panel.empty:SetWidth(300)
  panel.more = panel:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
  panel.more:SetPoint("BOTTOMLEFT", 20, 30)
  local note = panel:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
  note:SetPoint("BOTTOMLEFT", 20, 16)
  note:SetText("Click a row to search for it. You post and buy.")
  panel.note = note
  -- The shopping list as a search for TSM's Shopping tab, to copy with Ctrl+C.
  local copy = CreateFrame("Button", nil, panel, "UIPanelButtonTemplate")
  copy:SetSize(96, 20)
  copy:SetPoint("BOTTOMRIGHT", -16, 12)
  copy:SetText("Copy for TSM")
  copy:SetScript("OnClick", function() FG.showCopy(FG.shoppingString()) end)
  copy:Hide()
  panel.copy = copy
  panel:SetScript("OnShow", refresh)
end

function FG.togglePanel()
  if not panel then create() end
  if panel:IsShown() then panel:Hide() else
    state.autoShown = false
    FG.placePanel()
    panel:Show()
  end
end

-- Where the panel goes. Your own spot, once you have dragged it; else docked
-- to the auction house window's right edge (its left edge when there is no
-- room). TSM and other auction addons replace that window and park the
-- default one off screen, so the dock is only used when the window is really
-- visible on screen; otherwise the panel sits at the right of the screen.
local function onScreen(f)
  if not f or call(f, "IsVisible") == false then return false end
  local l, r, t, b = call(f, "GetLeft"), call(f, "GetRight"), call(f, "GetTop"), call(f, "GetBottom")
  if type(l) ~= "number" or type(r) ~= "number" or type(t) ~= "number" or type(b) ~= "number" then return false end
  local w, h = call(UIParent, "GetWidth") or 0, call(UIParent, "GetHeight") or 0
  if w <= 0 or h <= 0 then return true end
  return r > 50 and l < w - 50 and t > 50 and b < h - 50 and (call(f, "GetAlpha") or 1) > 0.05
end

function FG.placePanel()
  if not panel then return end
  panel:ClearAllPoints()
  local pos = FG.db and FG.db.settings.panelPos
  if type(pos) == "table" and pos[1] then
    panel:SetPoint(pos[1], UIParent, pos[2] or pos[1], pos[3] or 0, pos[4] or 0)
    return "saved"
  end
  local ah = _G.AuctionHouseFrame
  if onScreen(ah) then
    local room = (call(UIParent, "GetWidth") or 0) - (call(ah, "GetRight") or 0)
    if room > 0 and room < 370 and (call(ah, "GetLeft") or 0) > 370 then
      panel:SetPoint("TOPRIGHT", ah, "TOPLEFT", -2, 0)
      return "left"
    end
    panel:SetPoint("TOPLEFT", ah, "TOPRIGHT", 2, 0)
    return "right"
  end
  panel:SetPoint("RIGHT", UIParent, "RIGHT", -40, 40)
  return "screen"
end

FG.on("AUCTION_HOUSE_SHOW", function()
  if not panel then create() end
  FG.placePanel()
  -- Auction addons build their window a moment after this event: place again.
  if C_Timer then C_Timer.After(0.3, FG.placePanel) end
  state.autoShown = true
  panel:Show()
end)

FG.on("AUCTION_HOUSE_CLOSED", function()
  if panel and state.autoShown then panel:Hide() end
end)

FG.on("BAG_UPDATE_DELAYED", function() C_Timer.After(1.2, refresh) end)

-- A small box with text to copy: WoW has no clipboard access, so Ctrl+C it is.
local copyBox
function FG.showCopy(text)
  if not copyBox then
    copyBox = CreateFrame("Frame", "ForeverGoldCopy", UIParent, "BackdropTemplate")
    copyBox:SetSize(420, 70)
    copyBox:SetPoint("CENTER")
    copyBox:SetFrameStrata("DIALOG")
    copyBox:SetBackdrop({ bgFile = "Interface\\DialogFrame\\UI-DialogBox-Background", edgeFile = "Interface\\DialogFrame\\UI-DialogBox-Border", tile = true, tileSize = 32, edgeSize = 32, insets = { left = 11, right = 12, top = 12, bottom = 11 } })
    local label = copyBox:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
    label:SetPoint("TOPLEFT", 18, -14)
    label:SetText("Ctrl+C, then paste into TSM's Shopping search. Escape closes.")
    local eb = CreateFrame("EditBox", nil, copyBox, "InputBoxTemplate")
    eb:SetSize(380, 20)
    eb:SetPoint("BOTTOMLEFT", 22, 16)
    eb:SetAutoFocus(true)
    eb:SetScript("OnEscapePressed", function() copyBox:Hide() end)
    copyBox.eb = eb
    table.insert(UISpecialFrames, "ForeverGoldCopy")
  end
  copyBox.eb:SetText(text or "")
  copyBox.eb:HighlightText()
  copyBox:Show()
end

-- Opens the panel on one tab; returns how many rows it shows.
function FG.showTab(tab)
  if not panel then create() end
  state.tab, state.offset = tab, 0
  FG.placePanel()
  panel:Show()
  refresh()
  return #state.rows
end

-- At the mailbox, on any character but the bank alt: open on the Mail tab.
FG.on("MAIL_SHOW", function()
  local d = FG.data()
  if not d or (d.bank and d.bank == FG.playerName()) then return end
  if #FG.mailList() == 0 then return end
  FG.showTab("mail")
  state.autoShown = true
end)
FG.on("MAIL_CLOSED", function()
  if panel and state.autoShown and state.tab == "mail" then panel:Hide() end
end)
