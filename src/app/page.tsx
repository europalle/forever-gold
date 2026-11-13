import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { SETTINGS } from "@/config/settings";
import type { Call } from "@/lib/advice";
import { formatPercent } from "@/lib/money";
import { Header } from "@/components/header";
import { ActionTag, Card, Empty, Money, PageTitle, Pct } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { board, type Row } from "@/lib/queries/board";
import { signalBoard } from "@/lib/queries/signals";
import { CONDITION_LABEL } from "@/lib/signal-labels";

export default function Home() {
  return (
    <main className="mx-auto max-w-[1360px] px-4 pb-16 sm:px-8">
      <Header active="board" />
      <Suspense fallback={<BoardSkeleton />}>
        <Board />
      </Suspense>
    </main>
  );
}

function BoardSkeleton() {
  return (
    <div className="pt-7" aria-busy="true">
      <div className="skeleton h-8 w-40" />
      <div className="skeleton mt-3 h-5 w-96 max-w-full" />
      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <div className="skeleton h-64 lg:col-span-7" />
        <div className="skeleton h-64 lg:col-span-5" />
      </div>
      <div className="skeleton mt-6 h-96" />
    </div>
  );
}

const CONDITION_ORDER = ["CRASH", "FLOOD", "SQUEEZE", "SPIKE", "SLIDE", "DIP", "RICH", "UPTREND"];

async function Board() {
  await connection();
  const me = await requireUser();
  const [b, sig] = await Promise.all([board(me.id), signalBoard(me.id)]);

  if (!b.marketScanAt) {
    return (
      <>
        <PageTitle title="Board">No prices collected yet. The first collection fills this in.</PageTitle>
      </>
    );
  }

  const all = b.groups.flatMap((g) => g.rows);
  const converts = all.filter((r) => r.call.kind === "convert");
  const locked = all.filter((r) => r.locked.length > 0);
  const unpriced = all.filter((r) => r.call.kind === "no-data").map((r) => r.item.name);
  const strongMine = sig.mine.filter((r) => r.strength === 2);
  const todo = [...sig.mine.slice(0, 6)];
  const totalCalls = Object.values(sig.counts).reduce((a, n) => a + n, 0);
  const maxCount = Math.max(1, ...Object.values(sig.counts));

  const finding = strongMine.length
    ? `${strongMine.length} strong ${strongMine.length === 1 ? "call" : "calls"} on what you hold: ${strongMine.slice(0, 3).map((r) => `${r.name} (${r.action})`).join(", ")}.`
    : sig.buys.length
      ? `Nothing you hold needs you. ${sig.buys.length} ${sig.buys.length === 1 ? "buy" : "buys"} within your limit, the best is ${sig.buys[0].name}.`
      : converts.length
        ? `No signals on your stock. ${converts.length} of your materials pay more made into something else.`
        : sig.at
          ? "Nothing to do right now."
          : "Signals need 36h of price history.";

  return (
    <>
      <PageTitle title="Board" action={<Link href="/signals" className="btn">All signals</Link>}>
        {finding}
      </PageTitle>

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <Card title="Do now" note="Your stock, buys within your limit, crafts that beat selling raw." className="rise rise-2 lg:col-span-7">
          {todo.length === 0 && converts.length === 0 && sig.buys.length === 0 ? (
            <Empty>
              {sig.at ? "Nothing to do." : "No calls yet."}
            </Empty>
          ) : (
            <ul className="rows">
              {todo.map((r) => (
                <li key={r.itemId} className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <ActionTag action={r.action} strength={r.strength} />
                      <Link href={`/item/${r.itemId}`} className="font-medium hover:underline">{r.name}</Link>
                      <span className="text-xs text-muted">x{r.have}</span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted">{r.reason}</p>
                  </div>
                  <div className="text-right">
                    <Money c={r.price} />
                    <div className="text-xs text-muted">usual <Money c={r.fair} /></div>
                  </div>
                </li>
              ))}
              {sig.buys.slice(0, Math.max(0, 5 - todo.length)).map((r) => (
                <li key={`buy-${r.itemId}`} className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <ActionTag action={r.action} strength={r.strength} />
                      <Link href={`/item/${r.itemId}`} className="font-medium hover:underline">{r.name}</Link>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted">{r.reason}</p>
                  </div>
                  <div className="text-right">
                    <Money c={r.price} />
                    <div className="text-xs text-muted">usual <Money c={r.fair} /></div>
                  </div>
                </li>
              ))}
              {converts.map((r) =>
                r.call.kind === "convert" ? (
                  <li key={`make-${r.item.id}`} className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 px-4 py-2.5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="tag tag-buy">{r.call.verb}</span>
                        <Link href={`/item/${r.item.id}`} className="font-medium hover:underline">{r.item.name}</Link>
                      </div>
                      <p className="mt-0.5 truncate text-sm text-muted">{r.call.reason}</p>
                    </div>
                    <div className="text-right">
                      <Money c={r.call.gainPerUnit} sign className="text-good" />
                      <div className="text-xs text-muted">each vs raw</div>
                    </div>
                  </li>
                ) : null,
              )}
            </ul>
          )}
        </Card>

        <Card
          title="The market right now"
          note={sig.at ? `${totalCalls} items with a call` : "No calls yet"}
          className="rise rise-3 lg:col-span-5"
        >
          <ul className="px-4 pb-4">
            {CONDITION_ORDER.map((c) => {
              const n = sig.counts[c] ?? 0;
              return (
                <li key={c} className="grid h-7 grid-cols-[7.5rem_1fr_2.5rem] items-center gap-3">
                  <span className={n ? "" : "text-muted"}>{CONDITION_LABEL[c]}</span>
                  <span className="h-1.5 rounded-sm bg-raised">
                    <span className="block h-1.5 rounded-sm bg-gold" style={{ width: `${(n / maxCount) * 100}%` }} />
                  </span>
                  <span className={`num text-right ${n ? "" : "text-muted"}`}>{n}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Card
        title="Your materials"
        
        className="rise rise-3 mt-6"
      >
        <div className="overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th>Item</th>
                <th className="r">Cheapest</th>
                <th className="r hidden md:table-cell" title="TSM market value: a recent-weighted average">Market value</th>
                <th className="r hidden sm:table-cell">Since yesterday</th>
                <th className="r hidden md:table-cell" title="EU, all rulesets and factions">Sells</th>
                <th className="r hidden md:table-cell" title="EU, per auction house per day">Sold a day</th>
                <th>Call</th>
              </tr>
            </thead>
            <tbody>
              {b.groups.map((g) => {
                const priced = g.rows.filter((r) => r.call.kind !== "no-data");
                if (priced.length === 0) return null;
                return [
                  <tr key={g.group} className="group">
                    <td colSpan={7}>{g.group}</td>
                  </tr>,
                  ...priced.map((r) => <ItemRow key={r.item.id} row={r} />),
                ];
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {locked.length ? (
        <Card title="Would pay after levelling" note="Recipes above your skill that beat selling raw." className="mt-6">
          <ul className="rows">
            {locked.flatMap((r) =>
              r.locked.map((l) => (
                <li key={`${r.item.id}-${l.skill}`} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                  <span>
                    {l.verb} {r.item.name} <span className="text-muted">at skill {l.skill}</span>
                  </span>
                  <Money c={l.gainPerUnit} sign />
                </li>
              )),
            )}
          </ul>
        </Card>
      ) : null}

      <p className="mt-6 max-w-[90ch] text-xs text-muted">
        {Object.keys(b.skills).length ? (
          <>
            Your skills: {Object.entries(b.skills).map(([k, v]) => `${k} ${v}`).join(", ")}.{" "}
          </>
        ) : (
          <>
            <Link href="/ledger" className="text-text underline">Upload your TSM file</Link> so the calls use your profession skills.{" "}
          </>
        )}
        {unpriced.length ? <span title={unpriced.join(", ")}>{unpriced.length} tracked items have no listing. </span> : null}
        {formatPercent(SETTINGS.cut)} cut, <Money c={SETTINGS.depositPerListing} /> deposit per listing. {b.snapshots} price scans stored.
      </p>
    </>
  );
}

function ItemRow({ row }: { row: Row }) {
  const q = row.quote;
  const gap = q?.minBuyout && q.marketValue ? q.minBuyout / q.marketValue - 1 : null;
  return (
    <tr>
      <td>
        <Link href={`/item/${row.item.id}`} className="font-medium hover:underline">{row.item.name}</Link>
      </td>
      <td className="r">
        <Money c={q?.minBuyout} />
        {gap !== null && Math.abs(gap) >= 0.15 ? (
          <div className="text-xs text-muted">
            {gap > 0 ? "+" : ""}
            {formatPercent(gap)} to value
          </div>
        ) : null}
      </td>
      <td className="r hidden md:table-cell"><Money c={q?.marketValue} className="text-muted" /></td>
      <td className="r hidden sm:table-cell"><Pct v={row.trend} /></td>
      <td className="r num hidden md:table-cell">{formatPercent(q?.saleRate)}</td>
      <td className="r num hidden text-muted md:table-cell">
        {q?.soldPerDay !== null && q?.soldPerDay !== undefined ? Math.round(q.soldPerDay).toLocaleString("en-US") : "-"}
      </td>
      <td>
        <CallCell call={row.call} />
      </td>
    </tr>
  );
}

function CallCell({ call }: { call: Call }) {
  return (
    <div>
      {call.kind === "convert" ? (
        <>
          <span className="tag tag-buy">{call.verb}</span> <Money c={call.gainPerUnit} sign className="ml-1 text-good" /> <span className="text-muted">each</span>
        </>
      ) : call.kind === "sell" ? (
        <>
          <span className="tag tag-sell">Sell</span> <span className="ml-1 text-muted">nets</span> <Money c={call.net} />
        </>
      ) : call.kind === "hold" ? (
        <span className="tag tag-hold">Hold</span>
      ) : (
        <span className="tag">No data</span>
      )}
      <div className="mt-0.5 text-xs text-muted">{call.reason}</div>
    </div>
  );
}
