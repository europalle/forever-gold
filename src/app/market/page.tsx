import { connection } from "next/server";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { SETTINGS } from "@/config/settings";
import { requireUser } from "@/lib/auth";
import { formatPercent } from "@/lib/money";
import { capForUser, deals, levelWindowFor, movers, qualities, search, sparks, type LevelWindow, type MarketItem } from "@/lib/queries/market";
import { Card, How, ItemName, Meter, Money, PageTitle, Sparkline, Tabs } from "@/components/ui";

export const metadata = { title: "Market · Forever Gold" };

type SP = Promise<{ view?: string; q?: string; levels?: string }>;

export default function MarketPage({ searchParams }: { searchParams: SP }) {
  return (
    <main className="mx-auto max-w-[1360px] px-4 pb-16 sm:px-8">
      <Header active="market" />
      <Suspense fallback={<div className="pt-7" aria-busy="true"><div className="skeleton h-8 w-40" /><div className="skeleton mt-6 h-[520px]" /></div>}>
        <Market searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Market({ searchParams }: { searchParams: SP }) {
  await connection();
  const me = await requireUser();
  const { view: rawView, q = "", levels } = await searchParams;
  const view = q ? "search" : rawView === "movers" ? "movers" : "deals";
  const near = levels === "near";
  const lw = await levelWindowFor(me.id);
  const level: LevelWindow = near ? lw.window : null;
  const href = (v: string, n: boolean) => `/market?view=${v}${n ? "&levels=near" : ""}`;
  const base = view === "movers" ? "movers" : "deals";

  return (
    <>
      <PageTitle
        title="Market"
        action={
          <form action="/market" className="flex w-full max-w-sm gap-2">
            <input name="q" defaultValue={q} placeholder="Find any item" aria-label="Find any item" className="field" />
            <button type="submit" className="btn">Search</button>
          </form>
        }
      >
        {view === "search" ? `Matching "${q}"` : null}
      </PageTitle>
      <div className="flex flex-wrap items-end gap-x-10 border-b border-line">
        <Tabs
          className="!border-0"
          items={[
            { href: href("deals", near), label: "Cheap right now", on: view === "deals" },
            { href: href("movers", near), label: "Where the gold moves", on: view === "movers" },
          ]}
        />
        <Tabs
          className="ml-auto !border-0"
          items={[
            { href: href(base, false), label: "All levels", on: !near },
            { href: href(base, true), label: `Around my level${lw.level ? ` (${lw.window!.min}-${lw.window!.max})` : ""}`, on: near },
          ]}
        />
      </div>
      {near && (!lw.level || lw.known === 0) ? (
        <p className="mt-4 text-sm text-warn">
          {!lw.level
            ? "Your level comes from the addon: install it and let the app upload once."
            : "Item levels come from the addon: once it has looked items up and the app has uploaded, this filter fills in."}
        </p>
      ) : null}
      <div className="rise rise-2 mt-5">
        {view === "search" ? <Search q={q} /> : view === "movers" ? <Movers level={level} /> : <Deals userId={me.id} level={level} />}
      </div>
    </>
  );
}

async function Deals({ userId, level }: { userId: string; level: LevelWindow }) {
  const { cap, gold } = await capForUser(userId);
  const { items, trendSince } = await deals(cap, 40, level);
  return (
    <ItemTable
      items={items}
      empty="No deals right now."
      title={`${items.length} ${items.length === 1 ? "deal" : "deals"} at or under your limit`}
      note={
        <>
          At most <Money c={cap} /> each{gold !== null ? <>, 10% of your <Money c={gold} /></> : <>. Upload your TSM file to size this to your gold</>}.
        </>
      }
      how={
        <>
          <p>
            A deal is listed at least 25% under its usual price, sells well EU-wide (5+ a day, 40%+ of listings sell) and costs no more than your limit.
            The usual price is the lowest of TSM&apos;s market value, its long average and the EU average sale price.{" "}
            {trendSince ? "Items whose value fell over 10% in the last day are left out." : "With a day of history, items still sliding get left out; until then, check the item page before buying."}
          </p>
          <p className="mt-2">
            &quot;Listed at it&quot; comes from Blizzard&apos;s hourly listing; without it there may be only one. For gear, TSM prices the base item: an &quot;of the Monkey&quot; and
            an &quot;of the Owl&quot; version can sell for very different amounts, so compare the exact one before buying. Profit is the usual price after the{" "}
            {formatPercent(SETTINGS.cut)} cut, minus what you pay.
          </p>
        </>
      }
      extraHead={["Listed at it", "Usual", "Profit each"]}
      extra={(i) => {
        const d = i as (typeof items)[number];
        return (
          <>
            <td className="r num">{d.listedAtMin != null ? d.listedAtMin.toLocaleString("en-US") : <span className="text-muted">-</span>}</td>
            <td className="r"><Money c={d.target} className="text-muted" /></td>
            <td className="r"><Money c={d.profitEach} sign className="text-good" /></td>
          </>
        );
      }}
    />
  );
}

async function Movers({ level }: { level: LevelWindow }) {
  const { items } = await movers(40, level);
  return (
    <ItemTable
      items={items}
      empty="No sales data yet."
      title="Most gold traded a day"
      note="Sold a day x market value."
      how={<p>Units sold a day is the EU average per auction house, from TSM&apos;s region file, times this auction house&apos;s market value. The average sale price is not used: a few odd sales skew it.</p>}
      extraHead={["Gold a day"]}
      extra={(i) => <td className="r"><Money c={(i as (typeof items)[number]).goldPerDay} /></td>}
    />
  );
}

async function Search({ q }: { q: string }) {
  const items = await search(q);
  return <ItemTable items={items} empty={`No item on your market matches "${q}".`} title={`${items.length} ${items.length === 1 ? "item" : "items"}`} />;
}

async function ItemTable({
  items,
  empty,
  title,
  note,
  how,
  extra,
  extraHead = [],
}: {
  items: MarketItem[];
  empty: string;
  title: string;
  note?: React.ReactNode;
  how?: React.ReactNode;
  extra?: (i: MarketItem) => React.ReactNode;
  extraHead?: string[];
}) {
  const ids = items.map((i) => i.id);
  const [week, quality] = await Promise.all([sparks(ids), qualities(ids)]);
  return (
    <Card title={title} note={note} action={how ? <How label="How this is worked out">{how}</How> : undefined}>
      {items.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data min-w-[860px]">
            <thead>
              <tr>
                <th>Item</th>
                <th className="r">Cheapest</th>
                <th>Seven days</th>
                <th className="r">Market value</th>
                <th className="r" title="EU-wide: the share of listings that sell">Sells</th>
                <th className="r" title="EU average per auction house">Sold a day</th>
                {extraHead.map((h) => (
                  <th key={h} className="r">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td className="max-w-[320px]"><ItemName id={i.id} name={i.name} quality={quality.get(i.id)} className="max-w-full" /></td>
                  <td className="r"><Money c={i.minBuyout} /></td>
                  <td><Sparkline values={week.get(i.id) ?? []} /></td>
                  <td className="r"><Money c={i.marketValue} className="text-muted" /></td>
                  <td className="r"><Meter share={i.saleRate} /></td>
                  <td className="r num text-muted">{i.soldPerDay != null ? Math.round(i.soldPerDay).toLocaleString("en-US") : "-"}</td>
                  {extra?.(i)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
