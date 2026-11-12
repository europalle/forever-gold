import { connection } from "next/server";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { requireUser } from "@/lib/auth";
import { formatCopper, formatPercent } from "@/lib/money";
import { itemDetail } from "@/lib/queries/market";
import { itemSignal } from "@/lib/queries/signals";
import { ACTION_LABEL, CONDITION_LABEL, actionClass } from "@/lib/signal-labels";
import { PriceChart } from "./chart";

export const metadata = { title: "Item · Forever Gold" };

export default function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Header active="item" />
      <Suspense fallback={<p className="mt-8 text-muted">Loading…</p>}>
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

  return (
    <div className="mt-6 space-y-8">
      <section>
        <h1 className="text-xl font-semibold">{d.name}</h1>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="Cheapest now" value={formatCopper(last?.minBuyout)} />
          <Stat label="Market value" value={formatCopper(last?.marketValue)} />
          <Stat label="Sells (EU)" value={formatPercent(d.region?.saleRate)} hint="share of listings that sell" />
          <Stat
            label="Sold a day (EU)"
            value={d.region?.soldPerDay != null ? Math.round(d.region.soldPerDay).toLocaleString("en-US") : "-"}
            hint="per auction house"
          />
        </dl>
      </section>

      {sig?.signal ? <SignalBlock s={sig.signal} events={sig.events} /> : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Price history, your auction house</h2>
        {d.history.length ? <PriceChart points={d.history.map((h) => ({ t: h.at.getTime(), minBuyout: h.minBuyout, marketValue: h.marketValue }))} /> : <p className="text-muted">No history yet.</p>}
        <p className="mt-2 text-xs text-muted">
          One point per TSM scan, about every 3 hours. Scans older than 14 days are thinned to one a day.
        </p>
      </section>

      {d.depth ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Listed right now</h2>
          <p className="mb-2 text-sm text-muted">
            From Blizzard&apos;s listing of {d.depth.at.toISOString().slice(5, 16).replace("T", " ")} UTC: {d.depth.totalQty.toLocaleString("en-US")} units
            in {d.depth.auctions} auctions, {d.depth.qtyAtMin.toLocaleString("en-US")} at the cheapest price and{" "}
            {d.depth.qtyNearMin.toLocaleString("en-US")} within 5% of it.
          </p>
          <ul className="max-w-sm divide-y divide-line rounded border border-line text-sm">
            {d.depth.ladder.map(([price, qty]) => (
              <li key={price} className="num flex justify-between px-3 py-1.5">
                <span>{formatCopper(price)}</span>
                <span className="text-muted">{qty.toLocaleString("en-US")}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Your trades</h2>
        {d.mine.length ? (
          <ul className="divide-y divide-line rounded border border-line text-sm">
            {d.mine.map((r, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-x-4 px-3 py-2">
                <span>
                  {kindLabel[r.kind]} x{r.quantity} <span className="text-muted">· {r.character}</span>
                </span>
                <span className="num text-muted">
                  {r.unitPrice ? `${formatCopper(r.unitPrice)} each · ` : ""}
                  {r.time.toISOString().slice(5, 16).replace("T", " ")} UTC
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">None in your uploaded TSM history.</p>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded border border-line bg-panel p-3">
      <dt className="text-xs text-muted" title={hint}>{label}</dt>
      <dd className="num mt-1 text-base">{value}</dd>
    </div>
  );
}

function SignalBlock({ s, events }: { s: NonNullable<Awaited<ReturnType<typeof itemSignal>>["signal"]>; events: Awaited<ReturnType<typeof itemSignal>>["events"] }) {
  const pct = (x: number | null) => (x == null ? "-" : `${x > 0 ? "+" : ""}${Math.round(x * 100)}%`);
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Signal</h2>
      <div className="rounded border border-line p-3">
        <div className="flex flex-wrap items-baseline gap-2">
          {s.action !== "none" ? (
            <span className={`rounded border px-1.5 text-xs uppercase tracking-wide ${actionClass(s.action, s.strength)}`}>
              {s.strength === 2 ? "Strong " : ""}
              {ACTION_LABEL[s.action]}
            </span>
          ) : null}
          <span className="font-medium">{CONDITION_LABEL[s.condition]}</span>
        </div>
        <p className="mt-1 text-sm text-muted">{s.reason}</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          <Stat label="Usual (week median)" value={formatCopper(s.fair)} />
          <Stat label="Expected in 24h" value={formatCopper(s.expected)} />
          <Stat label="Last 24h" value={pct(s.change24)} />
          <Stat label="Trend a day" value={pct(s.slope)} />
          <Stat label="Supply vs usual" value={s.supplyRatio != null ? `${s.supplyRatio.toFixed(1)}x` : "-"} hint={s.supplyChange != null ? `${pct(s.supplyChange)} in 24h` : undefined} />
        </dl>
        {events.length > 1 ? (
          <p className="mt-3 text-xs text-muted">
            Earlier calls:{" "}
            {events
              .slice(1)
              .map((e) => `${e.at.toISOString().slice(5, 16).replace("T", " ")} ${ACTION_LABEL[e.action].toLowerCase()} (${CONDITION_LABEL[e.condition].toLowerCase()}) at ${formatCopper(e.price)}`)
              .join(" · ")}
          </p>
        ) : null}
      </div>
    </section>
  );
}
