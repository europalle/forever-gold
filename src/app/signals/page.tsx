import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { requireUser } from "@/lib/auth";
import { formatCopper, formatPercent } from "@/lib/money";
import { signalBoard, type SignalRow } from "@/lib/queries/signals";
import { ACTION_LABEL, CONDITION_LABEL, actionClass } from "@/lib/signal-labels";

export const metadata = { title: "Signals · Forever Gold" };

export default function SignalsPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Header active="signals" />
      <Suspense fallback={<p className="mt-8 text-muted">Loading…</p>}>
        <Signals />
      </Suspense>
    </main>
  );
}

async function Signals() {
  await connection();
  const me = await requireUser();
  const b = await signalBoard(me.id);
  return (
    <div className="mt-6 space-y-10">
      <p className="max-w-prose text-sm text-muted">
        Every item that trades is read like a commodity: its price against its own last week, how many are listed against
        normal, and which way both are moving. Calls are rebuilt every hour after the prices come in and land in game with the
        next advice. <Link href="#how" className="text-gold">How the calls work</Link>.
        {b.at ? <> Last built {timeAgo(b.at)}.</> : <> No calls yet: they need a day and a half of history.</>}
      </p>

      <Block title="Your stock" note="Calls on what you have in bags, bank and mail, strongest first." rows={b.mine} empty="Nothing you hold has a call right now." showHave />
      <Block title="Strong buys" note={`Calls to buy at or under ${formatCopper(b.cap)} each (10% of your gold).`} rows={b.buys} empty="No buys right now. That is normal: most of the time the right trade is none." />
      <Block title="Crashing and flooded" note="Don't sell into these, and don't catch them while they still fall." rows={b.storms} empty="Nothing crashing or flooded." />
      <Block title="Short supply" note="Listings dried up and the price jumped: post what you have before farmers refill it." rows={b.squeezes} empty="No shortages." />
      <Block title="Strong sells" note="Spikes and steady slides across the market." rows={b.sells} empty="No strong sells." />

      <Scoreboard sb={b.scoreboard} />
      <How />
    </div>
  );
}

function Block({ title, note, rows, empty, showHave }: { title: string; note: string; rows: SignalRow[]; empty: string; showHave?: boolean }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted">{note}</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-line rounded border border-line">
          {rows.map((r) => (
            <li key={r.itemId} className="grid gap-x-4 gap-y-1 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className={`rounded border px-1.5 text-xs uppercase tracking-wide ${actionClass(r.action, r.strength)}`}>
                    {r.strength === 2 ? "Strong " : ""}
                    {ACTION_LABEL[r.action]}
                  </span>
                  <Link href={`/item/${r.itemId}`} className="font-medium hover:text-gold">{r.name}</Link>
                  <span className="text-xs text-muted">{CONDITION_LABEL[r.condition]}</span>
                  {showHave && r.have > 0 ? <span className="text-xs text-muted">you have {r.have}</span> : null}
                </div>
                <p className="mt-0.5 text-sm text-muted">{r.reason}</p>
              </div>
              <dl className="grid grid-cols-3 gap-x-4 text-right text-sm sm:w-80">
                <Fig label="Now">{formatCopper(r.price)}</Fig>
                <Fig label="Usual">{formatCopper(r.fair)}</Fig>
                <Fig label="In 24h">{formatCopper(r.expected)}</Fig>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Fig({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num">{children}</dd>
    </div>
  );
}

function Scoreboard({ sb }: { sb: Awaited<ReturnType<typeof signalBoard>>["scoreboard"] }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">Track record</h2>
      <p className="max-w-prose text-sm text-muted">
        Don&apos;t trust a call until this says it works. The replay runs the rules over the last two weeks of the 400 most
        traded items as if it were back then, and checks each new call 72 hours later, after the 5% cut. A buy counts as right
        if selling then nets more than it cost; a sell, if the price was not higher later; a hold, if it fell under 5%; a wait,
        if it got cheaper within the day.
      </p>
      {!sb ? (
        <p className="mt-3 text-sm text-muted">Not run yet.</p>
      ) : (
        <div className="mt-3 grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold">Replay {sb.backtest.from ? `(${new Date(sb.backtest.from).toLocaleDateString("en-GB")} to ${new Date(sb.backtest.to!).toLocaleDateString("en-GB")})` : ""}</h3>
            {sb.backtest.rows.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Not enough history yet: calls need 72 hours to be judged.</p>
            ) : (
              <table className="mt-2 w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="py-1 font-normal">Call</th>
                    <th className="py-1 text-right font-normal">Times</th>
                    <th className="py-1 text-right font-normal">Right</th>
                    <th className="py-1 text-right font-normal">Avg result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {sb.backtest.rows.map((r) => (
                    <tr key={r.key}>
                      <td className="py-1">
                        {r.strength === 2 ? "Strong " : ""}
                        {ACTION_LABEL[r.action].toLowerCase()} · {CONDITION_LABEL[r.condition]}
                      </td>
                      <td className="num py-1 text-right">{r.n}</td>
                      <td className={`num py-1 text-right ${r.hitRate >= 0.55 ? "text-good" : r.hitRate < 0.45 ? "text-bad" : ""}`}>{formatPercent(r.hitRate)}</td>
                      <td className="num py-1 text-right">{(r.avgReturn >= 0 ? "+" : "") + formatPercent(r.avgReturn, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {sb.backtest.forecast.n > 0 ? (
              <p className="mt-2 text-xs text-muted">
                24-hour forecast: off by {formatPercent(sb.backtest.forecast.modelError, 1)} on average, against{" "}
                {formatPercent(sb.backtest.forecast.naiveError, 1)} for &quot;the price stays put&quot; ({sb.backtest.forecast.n} checks).{" "}
                {sb.backtest.forecast.modelError < sb.backtest.forecast.naiveError ? "The forecast is beating the simple guess." : "The forecast is not beating the simple guess yet."}
              </p>
            ) : null}
          </div>
          <div>
            <h3 className="text-sm font-semibold">Live calls</h3>
            {sb.live.n === 0 ? (
              <p className="mt-2 text-sm text-muted">No live call is 72 hours old yet.</p>
            ) : (
              <p className="mt-2 text-sm">
                {sb.live.n} calls judged, <span className="num">{formatPercent(sb.live.hits / sb.live.n)}</span> right, average result{" "}
                <span className="num">{(sb.live.avgReturn >= 0 ? "+" : "") + formatPercent(sb.live.avgReturn, 1)}</span>.{" "}
                {Object.entries(sb.live.byAction)
                  .map(([a, v]) => `${ACTION_LABEL[a]}: ${v.hits}/${v.n}`)
                  .join(", ")}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function How() {
  const cases: [string, string, string][] = [
    ["Flooded", "Oil glut 2014-16; the hog cycle", "Listed units far above their weekly normal and still climbing. High prices pulled farmers in and supply overshot. Hold yours; don't post into it."],
    ["Crashing", "Flash crashes and capitulation", "Down 20% or more in a day. While supply still rises it is a falling knife: wait. Once supply shrinks and the price holds, sellers are done and a liquid item tends to rebound: buy."],
    ["Short supply", "The 1973 oil embargo", "Listings dried up and the price jumped. Post now: the high price brings farmers back within days, and the price with it."],
    ["Spiked", "Mean reversion after a pump", "Far above its usual price with no shortage behind it. Spikes revert: sell."],
    ["Sliding", "Launch decay: consoles, IPOs after lockup", "Falling a few percent every day, steadily. Week-two prices drift down from launch highs as more players reach the content. Sell now, don't stock up."],
    ["Dip", "Buying value in a liquid market", "At least 25% under its usual price, selling well, with no glut and no slide behind it. Buy and relist near the usual price."],
    ["Rising", "Time-series momentum", "Climbing steadily while supply thins. Let it run before you post."],
  ];
  return (
    <section id="how">
      <h2 className="text-lg font-semibold">How the calls work</h2>
      <p className="max-w-prose text-sm text-muted">
        The usual price is the median of the cheapest listing over the last week. Supply is the number of units listed, from
        Blizzard&apos;s hourly listing, against its own weekly median: the way oil traders read stockpiles against their
        average. EU sales only decide whether an item is liquid (5+ sold a day, 20%+ of listings sell): items that hardly sell
        never get a buy. The 24-hour forecast carries half the trend forward and closes a quarter of the gap to the usual price.
      </p>
      <dl className="mt-4 grid gap-3 md:grid-cols-2">
        {cases.map(([name, real, text]) => (
          <div key={name} className="rounded border border-line p-3">
            <dt className="font-medium">
              {name} <span className="text-xs font-normal text-muted">· {real}</span>
            </dt>
            <dd className="mt-1 text-sm text-muted">{text}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 max-w-prose text-xs text-muted">
        Size every buy small: no single buy above a few percent of your gold, and never into a flood. A call is a reading of
        the market, not a promise.
      </p>
    </section>
  );
}

function timeAgo(d: Date) {
  const m = Math.round((Date.now() - d.getTime()) / 60_000);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}
