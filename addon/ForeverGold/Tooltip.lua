-- A short block under the item tooltip: price, value, demand, the call, and
-- what you own. Matches the calls on the website.
local _, FG = ...

local CALLS = {
  S = { "Sell", FG.GOLD },
  H = { "Hold", FG.WARN },
  C = { "Make", FG.GOOD },
  B = { "Buy", FG.GOOD },
  N = { "No price yet", FG.MUTED },
}

local function owned(id)
  local here, others = 0, 0
  local me = FG.playerName()
  for name, c in pairs(FG.db and FG.db.chars or {}) do
    local n = ((c.bags or {})[id] or 0) + ((c.bank or {})[id] or 0) + ((c.mail or {})[id] or 0)
    if name == me then here = here + n else others = others + n end
  end
  return here, others
end

local function addLines(tooltip, id)
  if not (FG.db and FG.db.settings.tooltip) then return end
  if type(id) ~= "number" then return end
  local d = FG.data()
  if not d then
    tooltip:AddLine("Forever Gold: no advice yet. Run the helper, then /reload.", 0.62, 0.62, 0.62, true)
    tooltip:Show()
    return
  end
  local p = d.p and d.p[id]
  local call = d.calls and d.calls[id]
  local here, others = owned(id)
  if not p and not call and here + others == 0 then return end

  tooltip:AddLine(" ")
  tooltip:AddLine("Forever Gold", 1, 0.82, 0)
  if p then
    tooltip:AddDoubleLine("  Cheapest now", FG.money(p.m), 1, 1, 1, 1, 1, 1)
    tooltip:AddDoubleLine("  Market value", FG.money(p.v), 1, 1, 1, 1, 1, 1)
    if p.r or p.d then
      tooltip:AddDoubleLine("  Sells (EU)", string.format("%s%% · %s a day", p.r or "-", p.d or "-"), 1, 1, 1, 1, 1, 1)
    end
  end
  if call then
    local c = CALLS[call.k] or CALLS.N
    local right = c[2] .. c[1] .. FG.R
    if call.k == "C" and call.g then right = c[2] .. (call.vb or "Make") .. ": +" .. FG.R .. FG.money(call.g) .. " each"
    elseif call.k == "B" and call.g then right = c[2] .. "Buy: +" .. FG.R .. FG.money(call.g) .. " each"
    elseif call.k == "S" and call.g then right = c[2] .. "Sell" .. FG.R .. ", nets " .. FG.money(call.g) end
    tooltip:AddDoubleLine("  Call", right, 1, 1, 1, 1, 1, 1)
    if call.t and IsShiftKeyDown and IsShiftKeyDown() then tooltip:AddLine("  " .. call.t, 0.62, 0.62, 0.62, true) end
  end
  if here + others > 0 then
    tooltip:AddDoubleLine("  You have", others > 0 and string.format("%d · alts %d", here, others) or tostring(here), 1, 1, 1, 1, 1, 1)
  end
  tooltip:Show()
end

-- Modern clients: one hook for every item tooltip. Older: GameTooltip only.
if TooltipDataProcessor and Enum and Enum.TooltipDataType and TooltipDataProcessor.AddTooltipPostCall then
  TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Item, function(tooltip, data)
    if not data or not FG.usable(data.id) then return end
    -- Any item tooltip (bag addons use their own), but not the comparison ones.
    local name = tooltip.GetName and tooltip:GetName() or ""
    if name:find("^ShoppingTooltip") or not tooltip.AddDoubleLine then return end
    FG.try(addLines, tooltip, data.id)
  end)
elseif GameTooltip and GameTooltip.HookScript then
  GameTooltip:HookScript("OnTooltipSetItem", function(tooltip)
    local _, link = tooltip:GetItem()
    local id = link and tonumber(link:match("item:(%d+)"))
    if id then FG.try(addLines, tooltip, id) end
  end)
end
