import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { requireUser } from "@/lib/auth";
import { formatPercent } from "@/lib/money";
import { signalBoard, type SignalRow } from "@/lib/queries/signals";
import { ACTION_LABEL, CONDITION_LABEL } from "@/lib/signal-labels";
import { ActionTag, Card, Empty, How, Money, PageTitle } from "@/components/ui";

export const metadata = { title: "Signals · Forever Gold" };

export default function SignalsPage() {
  return (
    <main className="mx-auto max-w-[1360px] px-4 pb-16 sm:px-8">
      <Header active="signals" />
      <Suspense fallback={<div className="pt-7" aria-busy="true"><div className="skeleton h-8 w-40" /><div className="skeleton mt-6 h-40" /><div className="mt-6 grid gap-6 lg:grid-cols-3"><div className="skeleton h-72" /><div className="skeleton h-72" /><div className="skeleton h-72" /></div></div>}>
        <Signals />
      </Suspense>
    </main>
  );
}

async function Signals() {
  await connection();
  const me = await requireUser();
  const b = await signalBoard(me.id);
  const strong = b.mine.filter((r) => r.strength === 2).length;
  const total = Object.values(b.counts).reduce((a, x) => a + x, 0);
  const finding = !b.at
    ? "No calls yet: they need a day and a half of price history."
    : strong
      ? `${strong} strong ${strong === 1 ? "call" : "calls"} on what you hold. ${total} calls across the market, rebuilt ${timeAgo(b.at)}.`
      : `${total} calls across the market, none strong on what you hold. Rebuilt ${timeAgo(b.at)}.`;
  return (
    <>
      <PageTitle title="Signals" action={<How label="How the calls work"><HowBody /></How>}>
        {finding}
      </PageTitle>

      <Column title="Your stock" note="Bags, bank and mail." rows={b.mine} empty="Nothing you hold has a call right now." showHave wide />

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Column title="Buy" note={<>Within your limit of <Money c={b.cap} /> each.</>} rows={b.buys} empty="No buys." />
        <Column title="Sell into" note="Shortages, spikes, slides." rows={dedupe([...b.squeezes, ...b.sells])} empty="No shortages, spikes or slides." />
        <Column title="Stay out" note="Crashing and flooded." rows={b.storms.filter((r) => r.action !== "buy")} empty="Nothing crashing or flooded." />
      </div>

      <Scoreboard sb={b.scoreboard} />
    </>
  );
}

function dedupe(rows: SignalRow[]) {
  const seen = new Set<number>();
  return rows.filter((r) => !seen.has(r.itemId) && seen.add(r.itemId));
}

const SHOW = 8;

function Column({ title, note, rows, empty, showHave, wide }: { title: string; note: React.ReactNode; rows: SignalRow[]; empty: string; showHave?: boolean; wide?: boolean }) {
  return (
    <Card title={<>{title} <span className="num ml-1 font-normal text-muted">{rows.length}</span></>} note={note} className="rise rise-2">
      {rows.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <ul className={`rows ${wide ? "lg:grid lg:grid-cols-2 lg:[&>*:nth-child(2)]:border-t-0 lg:[&>*:nth-child(odd)]:border-r lg:[&>*:nth-child(odd)]:border-rule" : ""}`}>
          {rows.slice(0, wide ? 12 : SHOW).map((r) => (
            <li key={r.itemId} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                  <ActionTag action={r.action} strength={r.strength} />
                  <Link href={`/item/${r.itemId}`} className="truncate font-medium hover:underline">{r.name}</Link>
                  {showHave && r.have > 0 ? <span className="text-xs text-muted">x{r.have}</span> : null}
                </span>
                <span className="text-xs text-muted">{CONDITION_LABEL[r.condition]}</span>
              </div>
              <p className="mt-1 text-sm text-muted">{r.reason}</p>
              <dl className="mt-2 flex gap-6 text-sm">
                <Fig label="Now"><Money c={r.price} /></Fig>
                <Fig label="Usual"><Money c={r.fair} className="text-muted" /></Fig>
                <Fig label="In 24h"><Money c={r.expected} className="text-muted" /></Fig>
              </dl>
            </li>
          ))}
        </ul>
      )}
      {rows.length > (wide ? 12 : SHOW) ? <p className="border-t border-rule px-4 py-2.5 text-xs text-muted">And {rows.length - (wide ? 12 : SHOW)} more, weaker or less traded.</p> : null}
    </Card>
  );
}

function Fig({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Scoreboard({ sb }: { sb: Awaited<ReturnType<typeof signalBoard>>["scoreboard"] }) {
  return (
    <section className="card mt-6 p-4">
      <h2 className="card-title">Track record</h2>
      <p className="mt-0.5 text-sm text-muted" title="A buy is right if selling 72h later nets more than it cost after the 5% cut; a sell, if the price was not higher; a hold, if it fell under 5%; a wait, if it got cheaper within a day.">Rules replayed over two weeks of the 400 most traded items, each call judged 72h later after the cut.</p>
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

function HowBody() {
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
    <div>
      <p>
        The usual price is the median of the cheapest listing over the last week. Supply is the number of units listed, from
        Blizzard&apos;s hourly listing, against its own weekly median: the way oil traders read stockpiles against their
        average. EU sales only decide whether an item is liquid (5+ sold a day, 20%+ of listings sell): items that hardly sell
        never get a buy. The 24-hour forecast carries half the trend forward and closes a quarter of the gap to the usual price.
      </p>
      <dl className="mt-4 grid gap-3 md:grid-cols-2">
        {cases.map(([name, real, text]) => (
          <div key={name} className="border-t border-rule pt-3">
            <dt className="font-medium text-text">
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
    </div>
  );
}

function timeAgo(d: Date) {
  const m = Math.round((Date.now() - d.getTime()) / 60_000);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}
