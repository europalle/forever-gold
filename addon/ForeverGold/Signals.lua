-- Market signals from the website (crashes, floods, shortages, dips), shown in
-- tooltips, the panel and chat, plus live alerts when the auction house shows
-- you a price far from usual. Reads and prints only.
local _, FG = ...

FG.BAD = "|cffff5050"

local ACTION = {
  B = { "Buy", FG.GOOD },
  S = { "Sell", FG.GOLD },
  H = { "Hold", FG.WARN },
  W = { "Wait", FG.BAD },
}
local CONDITION = {
  CRASH = "crashing", FLOOD = "flooded", SQUEEZE = "short supply", SPIKE = "spiked",
  SLIDE = "sliding", DIP = "dip", RICH = "above usual", UPTREND = "rising", CALM = "calm",
}

function FG.signal(id)
  local d = FG.data()
  return d and d.sig and d.sig[id]
end

-- "Strong sell · short supply", coloured by the action.
function FG.signalText(s)
  if not s then return nil end
  local a = ACTION[s.a] or { "Watch", FG.MUTED }
  return a[2] .. (s.s == 2 and "Strong " .. a[1]:lower() or a[1]) .. FG.R .. FG.MUTED .. " · " .. (CONDITION[s.c] or "") .. FG.R
end

-- The usual price: the signal's weekly median, else TSM's market value.
local function usual(id)
  local s = FG.signal(id)
  if s and s.f then return s.f end
  local d = FG.data()
  local p = d and d.p and d.p[id]
  return p and p.v
end

local function name(id)
  local n = C_Item and C_Item.GetItemNameByID and FG.try(C_Item.GetItemNameByID, id)
  return n or FG.try(GetItemInfo, id) or ("item " .. id)
end

-- At login: the strongest calls on what you have, and strong buys.
FG.on("PLAYER_LOGIN", function()
  if not (FG.db and FG.db.settings.chat) then return end
  local d = FG.data()
  if not (d and d.alerts and #d.alerts > 0) then return end
  local shown = 0
  for _, id in ipairs(d.alerts) do
    local s = d.sig and d.sig[id]
    if s and s.s == 2 then
      local here, others = FG.owned(id)
      local n = here + others
      FG.print(FG.signalText(s) .. ": " .. name(id) .. (n > 0 and (FG.MUTED .. " (you have " .. n .. ")" .. FG.R) or ""))
      shown = shown + 1
      if shown >= 4 then break end
    end
  end
  if #d.alerts > shown then FG.print(string.format("%d signals in all: /fg, Signals tab.", #d.alerts)) end
end)

-- Live alerts: a price you are looking at, far from usual. Once per item per
-- half hour, at most three lines in ten seconds.
local lastAlert, burst, burstAt = {}, 0, 0
function FG.liveCheck(id, price)
  if not (FG.db and FG.db.settings.chat and FG.db.settings.live ~= false) then return end
  if type(id) ~= "number" or type(price) ~= "number" or price <= 0 then return end
  local fair = usual(id)
  if not fair or fair <= 0 then return end
  local now = time()
  if lastAlert[id] and now - lastAlert[id] < 1800 then return end
  local ratio = price / fair
  local here, others = FG.owned(id)
  local d = FG.data()
  local p = d and d.p and d.p[id]
  local liquid = p and (p.d or 0) >= 5 and (p.r or 0) >= 20
  local s = FG.signal(id)
  local msg
  if ratio <= 0.65 and liquid then
    local off = math.floor((1 - ratio) * 100 + 0.5)
    msg = FG.GOOD .. "Live: " .. FG.R .. name(id) .. " at " .. FG.money(price) .. ", " .. off .. "% under usual."
    if s and (s.c == "CRASH" or s.c == "FLOOD") and s.a ~= "B" then
      msg = msg .. FG.BAD .. " But it is " .. CONDITION[s.c] .. ": wait." .. FG.R
    elseif d and d.buyCap and price > d.buyCap then
      msg = msg .. FG.MUTED .. " Over your buy limit." .. FG.R
    end
  elseif ratio >= 1.4 and here + others > 0 then
    local over = math.floor((ratio - 1) * 100 + 0.5)
    msg = FG.GOLD .. "Live: " .. FG.R .. name(id) .. " at " .. FG.money(price) .. ", " .. over .. "% above usual. Sell yours (you have " .. (here + others) .. ")."
  end
  if not msg then return end
  if now - burstAt > 10 then burst, burstAt = 0, now end
  if burst >= 3 then return end
  burst = burst + 1
  lastAlert[id] = now
  FG.print(msg)
end
