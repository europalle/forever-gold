import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { SETTINGS } from "@/config/settings";
import type { Call } from "@/lib/advice";
import { formatCopper, formatPercent } from "@/lib/money";
import { Header } from "@/components/header";
import { requireUser } from "@/lib/auth";
import { board, type Row } from "@/lib/queries/board";

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Header active="board" />
      <Suspense fallback={<p className="mt-8 text-muted">Loading prices…</p>}>
        <Board />
      </Suspense>
    </main>
  );
}

async function Board() {
  await connection();
  const me = await requireUser();
  const b = await board(me.id);

  if (!b.marketScanAt) {
    return (
      <p className="mt-8 text-muted">
        No prices collected yet. Run <code className="text-text">npm run collect</code>.
      </p>
    );
  }

  const all = b.groups.flatMap((g) => g.rows);
  const converts = all.filter((r) => r.call.kind === "convert");
  const holds = all.filter((r) => r.call.kind === "hold");
  const locked = all.filter((r) => r.locked.length > 0);

  return (
    <>
      <section className="mt-4 text-sm text-muted">
        <p>
          Market scan {when(b.marketScanAt)} · region sales {when(b.regionScanAt)} · {b.snapshots} market{" "}
          {b.snapshots === 1 ? "snapshot" : "snapshots"} stored
          {b.trendFrom ? ` · trend since ${when(b.trendFrom)}` : " · trend needs a second snapshot"}.
        </p>
        <p className="mt-1">
          {Object.keys(b.skills).length ? (
            <>
              Your skills, from your TSM upload:{" "}
              {Object.entries(b.skills)
                .map(([k, v]) => `${k} ${v}`)
                .join(", ")}
              .{" "}
            </>
          ) : (
            <>
              <a href="/ledger" className="text-gold hover:underline">Upload your TSM file</a> so the calls use your
              profession skills.{" "}
            </>
          )}
          Assumes a {formatPercent(SETTINGS.cut)} cut and a {formatCopper(SETTINGS.depositPerListing)} deposit per
          listing, weighted by the chance it expires. Neither is confirmed for Forever yet.
        </p>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <Summary title="Make these" tone="good" empty="Nothing beats selling raw right now.">
          {converts.map((r) =>
            r.call.kind === "convert" ? (
              <li key={r.item.id}>
                {r.call.verb} {r.item.name}: <span className="num text-good">+{formatCopper(r.call.gainPerUnit)}</span> each
              </li>
            ) : null,
          )}
        </Summary>
        <Summary
          title="Hold these"
          tone="warn"
          empty={
            b.trendFrom && hours(b.trendFrom) >= SETTINGS.holdNeedsHours
              ? "Nothing is in a dip worth waiting out."
              : `Hold calls start after ${SETTINGS.holdNeedsHours} hours of history, so a dip can be told from a slide.`
          }
        >
          {holds.map((r) => (
            <li key={r.item.id}>{r.item.name}</li>
          ))}
        </Summary>
        <Summary title="Would pay after levelling" tone="muted" empty="No locked recipe pays at today's prices.">
          {locked.flatMap((r) =>
            r.locked.map((l) => (
              <li key={`${r.item.id}-${l.skill}`}>
                {l.verb} {r.item.name} at {l.skill}: <span className="num">+{formatCopper(l.gainPerUnit)}</span>
              </li>
            )),
          )}
        </Summary>
      </section>

      {b.groups.map((g) =>
        g.rows.length === 0 ? null : (
          <section key={g.group} className="mt-8">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{g.group}</h2>
            <ul className="divide-y divide-line rounded border border-line sm:hidden">
              {g.rows.map((r) => (
                <ItemCard key={r.item.id} row={r} />
              ))}
            </ul>
            <div className="hidden overflow-x-auto rounded border border-line sm:block">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-panel text-left text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Item</th>
                    <th className="px-3 py-2 text-right font-medium">Cheapest</th>
                    <th className="px-3 py-2 text-right font-medium" title="TSM market value: a recent-weighted average">
                      Market value
                    </th>
                    <th className="px-3 py-2 text-right font-medium">Trend</th>
                    <th className="px-3 py-2 text-right font-medium" title="EU, all rulesets and factions">
                      Sells
                    </th>
                    <th className="px-3 py-2 text-right font-medium" title="EU, per auction house per day">
                      Sold/day
                    </th>
                    <th className="px-3 py-2 font-medium">Call</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => (
                    <ItemRow key={r.item.id} row={r} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ),
      )}

      <footer className="mt-10 border-t border-line pt-4 text-xs text-muted">
        Prices from TradeSkillMaster&apos;s public data. Cheapest and market value are your auction house; sells and sold/day are
        EU-wide. Percentages next to the cheapest price compare it with market value. Advice only: every action in
        game is yours.
      </footer>
    </>
  );
}

function ItemRow({ row }: { row: Row }) {
  const q = row.quote;
  const gap = q?.minBuyout && q.marketValue ? q.minBuyout / q.marketValue - 1 : null;
  return (
    <tr className="border-t border-line align-top">
      <td className="px-3 py-2">
        <Link href={`/item/${row.item.id}`} className="hover:text-gold">{row.item.name}</Link>
      </td>
      <td className="num px-3 py-2 text-right">
        {formatCopper(q?.minBuyout)}
        {gap !== null && Math.abs(gap) >= 0.15 ? (
          <span className={`ml-1 text-xs ${gap < 0 ? "text-bad" : "text-good"}`}>
            {gap > 0 ? "+" : ""}
            {formatPercent(gap)}
          </span>
        ) : null}
      </td>
      <td className="num px-3 py-2 text-right text-muted">{formatCopper(q?.marketValue)}</td>
      <td className="num px-3 py-2 text-right">{trend(row.trend)}</td>
      <td className="num px-3 py-2 text-right">{formatPercent(q?.saleRate)}</td>
      <td className="num px-3 py-2 text-right text-muted">
        {q?.soldPerDay !== null && q?.soldPerDay !== undefined ? Math.round(q.soldPerDay).toLocaleString("en-US") : "-"}
      </td>
      <td className="px-3 py-2">
        <CallCell call={row.call} />
      </td>
    </tr>
  );
}

function ItemCard({ row }: { row: Row }) {
  const q = row.quote;
  return (
    <li className="p-3">
      <div className="flex items-baseline justify-between gap-2">
        <Link href={`/item/${row.item.id}`} className="font-medium hover:text-gold">{row.item.name}</Link>
        <span className="num">{formatCopper(q?.minBuyout)}</span>
      </div>
      <div className="num mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
        <span>value {formatCopper(q?.marketValue)}</span>
        <span>trend {trend(row.trend)}</span>
        <span>sells {formatPercent(q?.saleRate)}</span>
      </div>
      <div className="mt-2">
        <CallCell call={row.call} />
      </div>
    </li>
  );
}

function CallCell({ call }: { call: Call }) {
  const tag = {
    convert: ["text-good", "verb" in call ? call.verb : ""],
    sell: ["text-text", "Sell"],
    hold: ["text-warn", "Hold"],
    "no-data": ["text-muted", "No data"],
  }[call.kind];
  return (
    <div>
      <span className={`font-semibold ${tag[0]}`}>{tag[1]}</span>
      {call.kind === "convert" ? (
        <span className="num ml-2 text-good">+{formatCopper(call.gainPerUnit)} each</span>
      ) : null}
      {call.kind === "sell" ? <span className="num ml-2 text-muted">nets {formatCopper(call.net)}</span> : null}
      <div className="text-xs text-muted">{call.reason}</div>
    </div>
  );
}

function Summary({
  title,
  tone,
  empty,
  children,
}: {
  title: string;
  tone: "good" | "warn" | "muted";
  empty: string;
  children: React.ReactNode[];
}) {
  const items = children.filter(Boolean);
  const color = { good: "text-good", warn: "text-warn", muted: "text-muted" }[tone];
  return (
    <div className="rounded border border-line bg-panel p-3">
      <h2 className={`text-sm font-semibold ${color}`}>{title}</h2>
      {items.length ? (
        <ul className="mt-2 space-y-1 text-sm">{items}</ul>
      ) : (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      )}
    </div>
  );
}

function trend(t: number | null) {
  if (t === null) return <span className="text-muted">-</span>;
  if (Math.abs(t) < 0.005) return <span className="text-muted">0%</span>;
  const cls = t > 0.02 ? "text-good" : t < -0.02 ? "text-bad" : "text-muted";
  return <span className={cls}>{(t > 0 ? "+" : "") + formatPercent(t)}</span>;
}

function when(d: Date | null) {
  if (!d) return "never";
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  const ago = mins < 60 ? `${mins} min ago` : mins < 48 * 60 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} days ago`;
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC (${ago})`;
}

function hours(d: Date) {
  return (Date.now() - d.getTime()) / 3_600_000;
}
