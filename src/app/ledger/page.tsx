import { connection } from "next/server";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { SETTINGS } from "@/config/settings";
import { requireUser } from "@/lib/auth";
import type { Totals } from "@/lib/ledger";
import { formatCopper, formatPercent } from "@/lib/money";
import { ledgerView, type LedgerView } from "@/lib/queries/ledger";
import { TsmUpload } from "./upload";

export const metadata = { title: "Ledger · Forever Gold" };

export default function LedgerPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Header active="ledger" />
      <div className="mt-6">
        <TsmUpload />
      </div>
      <Suspense fallback={<p className="mt-8 text-muted">Loading your ledger…</p>}>
        <Ledger />
      </Suspense>
    </main>
  );
}

async function Ledger() {
  await connection();
  const me = await requireUser();
  const v = await ledgerView(me.id);

  if (!v.lastUpload) {
    return (
      <p className="mt-6 max-w-prose text-muted">
        Nothing here yet. Upload TSM&apos;s saved file and this page shows what you sold and bought, for how much, what
        expired, and your gold over time. Every upload adds to the history, so it keeps sales TSM itself has trimmed.
      </p>
    );
  }

  return (
    <>
      <p className="mt-4 text-sm text-muted">
        Last upload {when(v.lastUpload)}. History since {when(v.firstRow)}. Sales are shown before the{" "}
        {formatPercent(SETTINGS.cut)} auction house cut; net is after it.
      </p>

      <section className="mt-4 grid gap-3 sm:grid-cols-2">
        <TotalsCard title="Last 7 days" t={v.week} />
        <TotalsCard title="All uploaded history" t={v.all} />
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Gold</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {v.characters.map((c) => (
            <li key={c.name} className="rounded border border-line bg-panel p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{c.name}</span>
                <span className="num">{formatCopper(c.money)}</span>
              </div>
              <Spark points={c.gold} />
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">By item</h2>
        <ul className="divide-y divide-line rounded border border-line">
          <li className="hidden grid-cols-[1fr_repeat(5,7rem)] gap-3 bg-panel px-3 py-2 text-xs text-muted sm:grid">
            <span>Item</span>
            <span className="text-right">Sold</span>
            <span className="text-right">Avg price</span>
            <span className="text-right">Cheapest now</span>
            <span className="text-right">Bought</span>
            <span className="text-right">Expired</span>
          </li>
          {v.items.map((i) => (
            <ItemLine key={i.itemId} i={i} />
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Recent</h2>
        <ul className="divide-y divide-line rounded border border-line text-sm">
          {v.recent.map((r, idx) => (
            <li key={idx} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2">
              <span>
                <span className={kindColor[r.kind] ?? "text-muted"}>{kindLabel[r.kind] ?? r.kind}</span> {r.name}
                {r.quantity > 1 ? <span className="text-muted"> x{r.quantity}</span> : null}
                <span className="text-muted"> · {r.character}</span>
              </span>
              <span className="num text-muted">
                {r.kind === "SALE" || r.kind === "BUY"
                  ? `${formatCopper(r.unitPrice * r.quantity)}`
                  : r.amount
                    ? formatCopper(r.amount)
                    : ""}{" "}
                · {when(r.time)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

const kindLabel: Record<string, string> = { SALE: "Sold", BUY: "Bought", EXPIRED: "Expired", CANCELLED: "Cancelled", INCOME: "Income", EXPENSE: "Paid" };
const kindColor: Record<string, string> = { SALE: "text-good", BUY: "text-text", EXPIRED: "text-warn", CANCELLED: "text-muted", INCOME: "text-good", EXPENSE: "text-bad" };

function TotalsCard({ title, t }: { title: string; t: Totals }) {
  return (
    <div className="rounded border border-line bg-panel p-3 text-sm">
      <h3 className="font-semibold text-gold">{title}</h3>
      <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
        <dt className="text-muted">Sold ({t.sales} sales)</dt>
        <dd className="num text-right">{formatCopper(t.sold)}</dd>
        <dt className="text-muted">Bought</dt>
        <dd className="num text-right">{formatCopper(t.bought)}</dd>
        <dt className="text-muted">Postage and fees</dt>
        <dd className="num text-right">{formatCopper(t.expenses)}</dd>
        {t.income ? (
          <>
            <dt className="text-muted">Other income</dt>
            <dd className="num text-right">{formatCopper(t.income)}</dd>
          </>
        ) : null}
        <dt className="font-medium">Net, after the cut</dt>
        <dd className={`num text-right font-medium ${t.net >= 0 ? "text-good" : "text-bad"}`}>{formatCopper(t.net)}</dd>
        <dt className="text-muted">Expired listings</dt>
        <dd className={`num text-right ${t.expired ? "text-warn" : ""}`}>{t.expired}</dd>
      </dl>
    </div>
  );
}

function ItemLine({ i }: { i: LedgerView["items"][number] }) {
  const avg = i.soldQty ? i.soldGross / i.soldQty : null;
  const vsNow = avg && i.cheapestNow ? i.cheapestNow / avg - 1 : null;
  return (
    <li className="grid grid-cols-2 gap-x-3 gap-y-1 px-3 py-2 text-sm sm:grid-cols-[1fr_repeat(5,7rem)]">
      <span className="col-span-2 font-medium sm:col-span-1 sm:font-normal">{i.name}</span>
      <Cell label="Sold">{i.soldQty ? `${i.soldQty} · ${formatCopper(i.soldGross)}` : "-"}</Cell>
      <Cell label="Avg price">{formatCopper(avg)}</Cell>
      <Cell label="Cheapest now">
        {formatCopper(i.cheapestNow)}
        {vsNow !== null && Math.abs(vsNow) >= 0.1 ? (
          <span className={`ml-1 text-xs ${vsNow > 0 ? "text-good" : "text-bad"}`}>
            {vsNow > 0 ? "+" : ""}
            {formatPercent(vsNow)}
          </span>
        ) : null}
      </Cell>
      <Cell label="Bought">{i.boughtQty ? `${i.boughtQty} · ${formatCopper(i.boughtCost)}` : "-"}</Cell>
      <Cell label="Expired" warn={i.expired > 0}>{i.expired || "-"}</Cell>
    </li>
  );
}

function Cell({ label, children, warn }: { label: string; children: React.ReactNode; warn?: boolean }) {
  return (
    <span className={`num flex justify-between gap-2 sm:block sm:text-right ${warn ? "text-warn" : ""}`}>
      <span className="text-xs text-muted sm:hidden">{label}</span>
      <span>{children}</span>
    </span>
  );
}

// Gold over time, from TSM's gold log. TSM logs a point when gold changes.
function Spark({ points }: { points: { at: Date; copper: number }[] }) {
  if (points.length < 2) return <p className="mt-2 text-xs text-muted">Gold history fills in as TSM logs changes.</p>;
  const w = 300;
  const h = 40;
  const t0 = points[0].at.getTime();
  const t1 = points[points.length - 1].at.getTime();
  const max = Math.max(...points.map((p) => p.copper));
  const min = Math.min(...points.map((p) => p.copper));
  const x = (t: number) => (t1 === t0 ? w : ((t - t0) / (t1 - t0)) * w);
  const y = (c: number) => (max === min ? h / 2 : h - 2 - ((c - min) / (max - min)) * (h - 4));
  const d = points.map((p, k) => `${k ? "L" : "M"}${x(p.at.getTime()).toFixed(1)},${y(p.copper).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 h-10 w-full" role="img" aria-label={`Gold from ${formatCopper(points[0].copper)} to ${formatCopper(points[points.length - 1].copper)}`}>
      <path d={d} fill="none" stroke="var(--gold)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function when(d: Date | null) {
  if (!d) return "-";
  return `${d.toISOString().slice(5, 16).replace("T", " ")} UTC`;
}
