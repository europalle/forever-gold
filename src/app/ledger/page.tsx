import { connection } from "next/server";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { requireUser } from "@/lib/auth";
import type { Totals } from "@/lib/ledger";
import { formatCopper, formatPercent } from "@/lib/money";
import { ledgerView } from "@/lib/queries/ledger";
import { itemMeta } from "@/lib/queries/market";
import { TsmUpload } from "./upload";
import { Card, ItemName, Money, PageTitle, Pct, Stat } from "@/components/ui";

export const metadata = { title: "Ledger · Forever Gold" };

export default function LedgerPage() {
  return (
    <main className="mx-auto max-w-[1360px] px-4 pb-16 sm:px-8">
      <Header active="ledger" />
      <Suspense fallback={<div className="pt-7" aria-busy="true"><div className="skeleton h-8 w-40" /><div className="skeleton mt-6 h-20" /><div className="skeleton mt-6 h-96" /></div>}>
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
      <PageTitle title="Ledger" action={<TsmUpload />}>
        No trades yet. Upload TradeSkillMaster.lua, or pair the app and it uploads at every logout.
      </PageTitle>
    );
  }
  const meta = await itemMeta(v.items.map((i) => i.itemId).filter((x): x is number => x != null));
  const gold = v.characters.reduce((a, c) => a + (c.money ?? 0), 0);

  return (
    <>
      <PageTitle title="Ledger" action={<TsmUpload />}>
        Net <Money c={v.week.net} sign className={v.week.net >= 0 ? "text-good" : "text-bad"} /> over 7 days after the cut. Last upload {when(v.lastUpload)}
        {v.measuredCut ? <>, measured cut {formatPercent(v.measuredCut.share, 1)} over {v.measuredCut.sales} sales</> : null}.
      </PageTitle>

      <dl className="rise rise-2 grid grid-cols-2 gap-x-8 gap-y-5 border-y border-line py-5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Gold, all characters"><Money c={gold} /></Stat>
        <Stat label="Sold, 7 days" note={`${v.week.sales} sales`}><Money c={v.week.sold} /></Stat>
        <Stat label="Bought, 7 days"><Money c={v.week.bought} /></Stat>
        <Stat label="Postage and fees, 7 days"><Money c={v.week.expenses} /></Stat>
        <Stat label="Net, 7 days" note={<>all time <Money c={v.all.net} sign /></>}><Money c={v.week.net} sign className={v.week.net >= 0 ? "text-good" : "text-bad"} /></Stat>
        <Stat label="Expired, 7 days" note={expiredNote(v.week)}><span className={`num ${v.week.expired ? "text-warn" : ""}`}>{v.week.expired}</span></Stat>
      </dl>

      <div className="rise rise-3 mt-6 grid gap-6 lg:grid-cols-12">
        <Card title="By item" className="lg:col-span-8">
          <div className="overflow-x-auto">
            <table className="data min-w-[640px]">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="r">Sold</th>
                  <th className="r">For</th>
                  <th className="r">Avg each</th>
                  <th className="r">Cheapest now</th>
                  <th className="r">Bought</th>
                  <th className="r">Expired</th>
                </tr>
              </thead>
              <tbody>
                {v.items.map((i) => {
                  const avg = i.soldQty ? i.soldGross / i.soldQty : null;
                  const vsNow = avg && i.cheapestNow ? i.cheapestNow / avg - 1 : null;
                  return (
                    <tr key={i.itemId ?? i.name}>
                      <td>{i.itemId != null ? <ItemName id={i.itemId} name={i.name} quality={meta.get(i.itemId)?.quality} icon={meta.get(i.itemId)?.icon} /> : i.name}</td>
                      <td className="r num">{i.soldQty || <span className="text-muted">-</span>}</td>
                      <td className="r"><Money c={i.soldQty ? i.soldGross : null} /></td>
                      <td className="r"><Money c={avg} className="text-muted" /></td>
                      <td className="r">
                        <Money c={i.cheapestNow} />
                        {vsNow !== null && Math.abs(vsNow) >= 0.1 ? <div className="text-xs"><Pct v={vsNow} /></div> : null}
                      </td>
                      <td className="r">{i.boughtQty ? <><span className="num text-muted">{i.boughtQty} for </span><Money c={i.boughtCost} /></> : <span className="num text-muted">-</span>}</td>
                      <td className={`r num ${i.expired ? "text-warn" : "text-muted"}`}>{i.expired || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex flex-col gap-6 lg:col-span-4">
          <Card title="Gold">
            <ul className="rows">
              {v.characters.map((c) => (
                <li key={c.name} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{c.name}</span>
                    <Money c={c.money} />
                  </div>
                  <GoldLine points={c.gold} />
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Recent" className="flex-1">
            <ul className="rows">
              {v.recent.slice(0, 12).map((r, idx) => (
                <li key={idx} className="flex items-baseline justify-between gap-3 px-4 py-2">
                  <span className="min-w-0 truncate">
                    <span className={kindColor[r.kind] ?? "text-muted"}>{kindLabel[r.kind] ?? r.kind}</span> {r.name}
                    {r.quantity > 1 ? <span className="num text-muted"> x{r.quantity}</span> : null}
                  </span>
                  <span className="shrink-0 text-right">
                    <Money c={r.kind === "SALE" || r.kind === "BUY" ? r.unitPrice * r.quantity : r.amount || null} />
                    <span className="num ml-2 text-xs text-muted">{r.time.toISOString().slice(5, 16).replace("T", " ")}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

function expiredNote(t: Totals) {
  const listed = t.sales + t.expired;
  return listed ? `${Math.round((t.expired / listed) * 100)}% of what ended` : undefined;
}

const kindLabel: Record<string, string> = { SALE: "Sold", BUY: "Bought", EXPIRED: "Expired", CANCELLED: "Cancelled", INCOME: "Income", EXPENSE: "Paid" };
const kindColor: Record<string, string> = { SALE: "text-good", BUY: "text-text", EXPIRED: "text-warn", CANCELLED: "text-muted", INCOME: "text-good", EXPENSE: "text-bad" };

// Gold over time from TSM's log. The scale leaves headroom of at least a
// tenth of the balance, so a small change does not read as a cliff.
function GoldLine({ points }: { points: { at: Date; copper: number }[] }) {
  if (points.length < 2) return null;
  const w = 300;
  const h = 44;
  const t0 = points[0].at.getTime();
  const t1 = points[points.length - 1].at.getTime();
  const max = Math.max(...points.map((p) => p.copper));
  const min = Math.min(...points.map((p) => p.copper));
  const mid = (max + min) / 2;
  const span = Math.max(max - min, mid * 0.2) * 1.2;
  const lo = mid - span / 2;
  const x = (t: number) => (t1 === t0 ? w : ((t - t0) / (t1 - t0)) * (w - 4));
  const y = (c: number) => h - 2 - ((c - lo) / span) * (h - 4);
  const d = points.map((p, k) => `${k ? "L" : "M"}${x(p.at.getTime()).toFixed(1)},${y(p.copper).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-2 h-11 w-full" role="img" aria-label={`Gold from ${formatCopper(points[0].copper)} to ${formatCopper(last.copper)}`}>
      <path d={`${d} L${x(last.at.getTime()).toFixed(1)},${h} L0,${h} Z`} fill="#d8b25a" fillOpacity="0.08" />
      <path d={d} fill="none" stroke="var(--gold)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function when(d: Date | null) {
  if (!d) return "-";
  return `${d.toISOString().slice(5, 16).replace("T", " ")} UTC`;
}
