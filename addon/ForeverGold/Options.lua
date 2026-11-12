-- Minimap button, the settings page (Esc, Options, AddOns), and /fg status.
local _, FG = ...

local function count(t)
  local n = 0
  for _ in pairs(t or {}) do n = n + 1 end
  return n
end

-- What the addon sees, for "/fg status" and the settings page.
function FG.statusLines()
  local lines = { "Forever Gold " .. FG.version }
  local d = FG.data()
  if d then
    table.insert(lines, string.format("Advice for %s, written %s ago; prices %s old.", d.user or "?", FG.ago(d.generatedAt), FG.ago(d.scanAt)))
    table.insert(lines, string.format("%d item prices, %d calls; %d to post, %d to make, %d to buy.", count(d.p), count(d.calls),
      #((d.lists or {}).sell or {}), #((d.lists or {}).make or {}), #((d.lists or {}).buy or {})))
  else
    table.insert(lines, "No advice loaded. Start the helper on your PC; when it says it wrote new advice, /reload.")
  end
  local me = FG.db and FG.db.chars[UnitName("player")]
  if me then
    table.insert(lines, string.format("This character: level %s, %d kinds of items in bags, %d professions recorded.",
      tostring(me.level or "?"), count(me.bags), count(me.profs)))
  end
  table.insert(lines, string.format("Item details looked up so far: %d. Saved at logout or /reload; the helper uploads them.", count(FG.db and FG.db.items)))
  table.insert(lines, string.format("Tooltip %s, login lines %s, minimap button %s.",
    FG.db and FG.db.settings.tooltip and "on" or "off", FG.db and FG.db.settings.chat and "on" or "off",
    FG.db and FG.db.settings.minimap and "on" or "off"))
  return lines
end

function FG.status()
  for _, l in ipairs(FG.statusLines()) do FG.print(l) end
end

-- Minimap button: left click opens the panel, right click the settings, drag
-- to move it around the minimap.
local button
local function placeButton()
  if not button then return end
  local a = math.rad(FG.db.settings.minimapAngle or 200)
  local r = (Minimap:GetWidth() / 2) + 5
  button:ClearAllPoints()
  button:SetPoint("CENTER", Minimap, "CENTER", math.cos(a) * r, math.sin(a) * r)
end

local function createButton()
  if button or not Minimap then return end
  button = CreateFrame("Button", "ForeverGoldMinimapButton", Minimap)
  button:SetSize(31, 31)
  button:SetFrameStrata("MEDIUM")
  button:SetFrameLevel(8)
  button:RegisterForClicks("LeftButtonUp", "RightButtonUp")
  button:RegisterForDrag("LeftButton")
  button:SetHighlightTexture("Interface\\Minimap\\UI-Minimap-ZoomButton-Highlight")
  local icon = button:CreateTexture(nil, "BACKGROUND")
  icon:SetSize(20, 20)
  icon:SetTexture("Interface\\Icons\\INV_Misc_Coin_02")
  icon:SetPoint("CENTER", 0, 1)
  local border = button:CreateTexture(nil, "OVERLAY")
  border:SetSize(53, 53)
  border:SetTexture("Interface\\Minimap\\MiniMap-TrackingBorder")
  border:SetPoint("TOPLEFT")
  button:SetScript("OnClick", function(_, which)
    if which == "RightButton" then
      if FG.openSettings then FG.openSettings() end
    elseif FG.togglePanel then
      FG.togglePanel()
    end
  end)
  button:SetScript("OnDragStart", function(self)
    self:SetScript("OnUpdate", function()
      local mx, my = Minimap:GetCenter()
      local cx, cy = GetCursorPosition()
      local s = Minimap:GetEffectiveScale()
      FG.db.settings.minimapAngle = math.deg(math.atan2(cy / s - my, cx / s - mx))
      placeButton()
    end)
  end)
  button:SetScript("OnDragStop", function(self) self:SetScript("OnUpdate", nil) end)
  button:SetScript("OnEnter", function(self)
    GameTooltip:SetOwner(self, "ANCHOR_LEFT")
    GameTooltip:AddLine("Forever Gold", 1, 0.82, 0)
    local d = FG.data()
    GameTooltip:AddLine(d and ("Advice " .. FG.ago(d.generatedAt) .. " old") or "No advice yet: start the helper", 1, 1, 1)
    GameTooltip:AddLine("Left click: panel. Right click: settings. Drag: move.", 0.62, 0.62, 0.62)
    GameTooltip:Show()
  end)
  button:SetScript("OnLeave", function() GameTooltip:Hide() end)
  placeButton()
end

function FG.updateMinimapButton()
  if FG.db.settings.minimap then
    createButton()
    if button then button:Show() end
  elseif button then
    button:Hide()
  end
end

-- Settings page under Esc, Options, AddOns.
local category
local function createSettings()
  local page = CreateFrame("Frame", "ForeverGoldOptions")
  page.name = "Forever Gold"
  local title = page:CreateFontString(nil, "ARTWORK", "GameFontNormalLarge")
  title:SetPoint("TOPLEFT", 16, -16)
  title:SetText("Forever Gold " .. FG.version)
  local about = page:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  about:SetPoint("TOPLEFT", title, "BOTTOMLEFT", 0, -8)
  about:SetWidth(560)
  about:SetJustifyH("LEFT")
  about:SetText("Market advice from your guild's Forever Gold site. It reads and shows only: it never posts, buys, cancels or sends.")

  local y = -70
  local function check(key, label, after)
    local cb = CreateFrame("CheckButton", nil, page, "UICheckButtonTemplate")
    cb:SetPoint("TOPLEFT", 16, y)
    -- The template's label is cb.Text on most clients; make one if it is missing.
    local text = (type(cb.Text) == "table" and cb.Text) or (type(cb.text) == "table" and cb.text) or nil
    if not text then
      text = cb:CreateFontString(nil, "ARTWORK", "GameFontHighlight")
      text:SetPoint("LEFT", cb, "RIGHT", 4, 0)
    end
    text:SetText(label)
    cb:SetScript("OnShow", function(self) self:SetChecked(FG.db.settings[key]) end)
    cb:SetScript("OnClick", function(self)
      FG.db.settings[key] = self:GetChecked() and true or false
      if after then after() end
    end)
    y = y - 30
  end
  check("tooltip", "Show the Forever Gold block on item tooltips")
  check("chat", "Show the advice summary in chat at login")
  check("minimap", "Show the minimap button", FG.updateMinimapButton)

  local open = CreateFrame("Button", nil, page, "UIPanelButtonTemplate")
  open:SetSize(200, 24)
  open:SetPoint("TOPLEFT", 20, y - 10)
  open:SetText("Open the advice panel")
  open:SetScript("OnClick", function() if FG.togglePanel then FG.togglePanel() end end)

  local status = page:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  status:SetPoint("TOPLEFT", 20, y - 50)
  status:SetWidth(560)
  status:SetJustifyH("LEFT")
  page:SetScript("OnShow", function()
    status:SetText(table.concat(FG.statusLines(), "\n"))
  end)

  if Settings and Settings.RegisterCanvasLayoutCategory then
    category = Settings.RegisterCanvasLayoutCategory(page, "Forever Gold")
    Settings.RegisterAddOnCategory(category)
  elseif InterfaceOptions_AddCategory then
    InterfaceOptions_AddCategory(page)
  end
  FG.settingsPage = page
end

function FG.openSettings()
  if category and Settings and Settings.OpenToCategory then
    FG.try(Settings.OpenToCategory, category:GetID())
  elseif InterfaceOptionsFrame_OpenToCategory and FG.settingsPage then
    FG.try(InterfaceOptionsFrame_OpenToCategory, FG.settingsPage)
  else
    FG.status()
  end
end

FG.on("PLAYER_LOGIN", function()
  FG.try(createSettings)
  FG.try(FG.updateMinimapButton)
end)
