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

local owned = FG.owned

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
  local sig = FG.signal and FG.signal(id)
  local here, others = owned(id)
  if not p and not call and not sig and not FG.live[id] and here + others == 0 and not (FG.disenchantValue and FG.disenchantValue(id)) then return end

  tooltip:AddLine(" ")
  tooltip:AddLine("Forever Gold", 1, 0.82, 0)
  if p or FG.live[id] then
    local now, live, at = FG.priceNow(id)
    tooltip:AddDoubleLine(live and "  Cheapest now (live)" or "  Cheapest now",
      FG.money(now) .. (live and (FG.MUTED .. " " .. FG.ago(at) .. FG.R) or ""), 1, 1, 1, 1, 1, 1)
    if p then tooltip:AddDoubleLine("  Market value", FG.money(p.v), 1, 1, 1, 1, 1, 1) end
    if p and (p.r or p.d) then
      tooltip:AddDoubleLine("  Sells (EU)", string.format("%s%% · %s a day", p.r or "-", p.d or "-"), 1, 1, 1, 1, 1, 1)
    end
  end
  if call then
    local c = CALLS[call.k] or CALLS.N
    local right = c[2] .. c[1] .. FG.R
    if call.k == "C" and call.g then right = c[2] .. (call.vb or "Make") .. ": +" .. FG.R .. FG.money(call.g) .. " each"
    elseif call.k == "B" and call.g then right = c[2] .. "Buy: +" .. FG.R .. FG.money(call.g) .. " each"
    elseif call.k == "S" and call.g then
      local now, live = FG.priceNow(id)
      local net = live and now and now * (1 - (d.cut or 0.05)) or call.g
      right = c[2] .. "Sell" .. FG.R .. ", nets " .. FG.money(net)
    end
    tooltip:AddDoubleLine("  Call", right, 1, 1, 1, 1, 1, 1)
    if call.t and IsShiftKeyDown and IsShiftKeyDown() then tooltip:AddLine("  " .. call.t, 0.62, 0.62, 0.62, true) end
  end
  if sig then
    tooltip:AddDoubleLine("  Signal", FG.signalText(sig), 1, 1, 1, 1, 1, 1)
    if sig.f then tooltip:AddDoubleLine("  Usual (week) · in 24h", FG.money(sig.f) .. FG.MUTED .. " · " .. FG.R .. FG.money(sig.e), 1, 1, 1, 1, 1, 1) end
    if sig.t and IsShiftKeyDown and IsShiftKeyDown() then tooltip:AddLine("  " .. sig.t, 0.62, 0.62, 0.62, true) end
  end
  local de, deFrom
  if FG.disenchantValue then de, deFrom = FG.disenchantValue(id) end
  if de then
    local now = FG.priceNow(id)
    local sell = now and now * (1 - (d.cut or 0.05))
    local verdict = sell and (de > sell and (FG.GOOD .. "  disenchant" .. FG.R) or (FG.GOLD .. "  sell" .. FG.R)) or ""
    tooltip:AddDoubleLine("  Disenchants for (" .. (deFrom or "?") .. ")", FG.money(de) .. verdict, 1, 1, 1, 1, 1, 1)
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
