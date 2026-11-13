import { connection } from "next/server";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { requireUser } from "@/lib/auth";
import { formatPercent } from "@/lib/money";
import { itemDetail, itemMeta } from "@/lib/queries/market";
import { itemSignal } from "@/lib/queries/signals";
import { CONDITION_LABEL } from "@/lib/signal-labels";
import { PriceChart } from "./chart";
import { ActionTag, Card, Empty, ItemIcon, Money, Pct, Stat } from "@/components/ui";

export const metadata = { title: "Item · Forever Gold" };

export default function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto max-w-[1360px] px-4 pb-16 sm:px-8">
      <Header active="item" />
      <Suspense fallback={<div className="pt-7" aria-busy="true"><div className="skeleton h-8 w-64" /><div className="skeleton mt-6 h-20" /><div className="skeleton mt-6 h-96" /></div>}>
        <Item params={params} />
      </Suspense>
    </main>
  );
}

const kindLabel: Record<string, string> = { SALE: "Sold", BUY: "Bought", EXPIRED: "Expired", CANCELLED: "Cancelled" };

async function Item({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const me = await requireUser();
  const id = Number((await params).id);
  const ok = Number.isInteger(id) && id > 0;
  const [d, sig] = ok ? await Promise.all([itemDetail(id, me.id), itemSignal(id)]) : [null, null];
  if (!d) return <p className="mt-8 text-muted">No prices for that item on your market yet.</p>;
  const last = d.history[d.history.length - 1];
  const meta = (await itemMeta([id])).get(id);
  const maxQty = d.depth ? Math.max(1, ...d.depth.ladder.map(([, q]) => q)) : 1;
  const s = sig?.signal ?? null;

  return (
    <>
      <div className="rise flex flex-wrap items-end justify-between gap-x-8 gap-y-3 pb-5 pt-7">
        <div className="min-w-0">
          <h1 className="flex items-center gap-3 text-2xl font-bold">
            <ItemIcon icon={meta?.icon} quality={meta?.quality} size={32} />
            {d.name}
          </h1>
          <p className="mt-1 max-w-[80ch] text-base text-muted">{s && s.action !== "none" ? s.reason : "No call."}</p>
        </div>
        {s && s.action !== "none" ? <ActionTag action={s.action} strength={s.strength} /> : null}
      </div>

      <dl className="rise rise-2 grid grid-cols-2 gap-x-8 gap-y-5 border-y border-line py-5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Cheapest now"><Money c={last?.minBuyout} /></Stat>
        <Stat label="Usual, week median"><Money c={s?.fair ?? last?.marketValue} /></Stat>
        <Stat label="Expected in 24h" note={s?.change24 != null ? <>last 24h <Pct v={s.change24} /></> : undefined}><Money c={s?.expected} /></Stat>
        <Stat label="Supply against usual" note={s?.supplyChange != null ? <>24h <Pct v={s.supplyChange} color={false} /></> : d.depth ? undefined : "needs Blizzard listings"}>
          <span className="num">{s?.supplyRatio != null ? `${s.supplyRatio.toFixed(1)}x` : "-"}</span>
        </Stat>
        {s?.soldHere != null ? (
          <>
            <Stat label="Sold a day, here" note="from the listings"><span className="num">{s.soldHere < 10 ? s.soldHere.toFixed(1) : Math.round(s.soldHere).toLocaleString("en-US")}</span></Stat>
            <Stat label="Days of supply" note="listed / sold a day"><span className={`num ${s.daysCover != null && s.daysCover > 14 ? "text-warn" : ""}`}>{s.daysCover != null ? (s.daysCover < 10 ? s.daysCover.toFixed(1) : Math.round(s.daysCover).toLocaleString("en-US")) : "-"}</span></Stat>
          </>
        ) : (
          <>
            <Stat label="Sells, EU" note="share of listings"><span className="num">{formatPercent(d.region?.saleRate)}</span></Stat>
            <Stat label="Sold a day, EU" note="per auction house"><span className="num">{d.region?.soldPerDay != null ? Math.round(d.region.soldPerDay).toLocaleString("en-US") : "-"}</span></Stat>
          </>
        )}
      </dl>

      <div className="rise rise-3 mt-6 grid gap-6 lg:grid-cols-12">
        <Card title="Price, your auction house"  className="lg:col-span-8">
          <div className="px-4 pb-4">
            {d.history.length ? <PriceChart points={d.history.map((h) => ({ t: h.at.getTime(), minBuyout: h.minBuyout, marketValue: h.marketValue }))} /> : <p className="text-muted">No history yet.</p>}
          </div>
        </Card>

        <div className="flex flex-col gap-6 lg:col-span-4">
          <Card
            title="Listed right now"
            note={d.depth ? `${d.depth.totalQty.toLocaleString("en-US")} units in ${d.depth.auctions.toLocaleString("en-US")} auctions, ${d.depth.at.toISOString().slice(11, 16)} UTC` : undefined}
            className="flex-1"
          >
            {d.depth ? (
              <ul className="px-4 pb-4">
                {d.depth.ladder.map(([price, qty], idx) => (
                  <li key={price} className="grid h-7 grid-cols-[6.5rem_1fr_4rem] items-center gap-3">
                    <Money c={price} className={idx === 0 ? "" : "text-muted"} />
                    <span className="h-1.5 rounded-sm bg-raised">
                      <span className={`block h-1.5 rounded-sm ${idx === 0 ? "bg-gold" : "bg-[#5a5a60]"}`} style={{ width: `${Math.max(2, (qty / maxQty) * 100)}%` }} />
                    </span>
                    <span className="num text-right text-muted">{qty.toLocaleString("en-US")}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No listing stored yet.</Empty>
            )}
          </Card>

          {sig && sig.events.length ? (
            <Card title="Calls so far" >
              <ul className="rows">
                {sig.events.map((e) => (
                  <li key={e.id} className="flex items-baseline justify-between gap-3 px-4 py-2">
                    <span className="flex items-baseline gap-2">
                      <ActionTag action={e.action} strength={e.strength} />
                      <span className="text-xs text-muted">{CONDITION_LABEL[e.condition]}</span>
                    </span>
                    <span className="text-right text-xs text-muted">
                      <Money c={e.price} className="text-sm text-text" /> <span className="num">{e.at.toISOString().slice(5, 16).replace("T", " ")}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>

      <Card title="Your trades"  className="mt-6">
        {d.mine.length ? (
          <table className="data">
            <thead>
              <tr>
                <th>What</th>
                <th>Character</th>
                <th className="r">Quantity</th>
                <th className="r">Each</th>
                <th className="r">When, UTC</th>
              </tr>
            </thead>
            <tbody>
              {d.mine.map((r, i) => (
                <tr key={i}>
                  <td>{kindLabel[r.kind]}</td>
                  <td className="text-muted">{r.character}</td>
                  <td className="r num">{r.quantity}</td>
                  <td className="r"><Money c={r.unitPrice || null} /></td>
                  <td className="r num text-muted">{r.time.toISOString().slice(5, 16).replace("T", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>None.</Empty>
        )}
      </Card>
    </>
  );
}
