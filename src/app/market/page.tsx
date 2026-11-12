import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { SETTINGS } from "@/config/settings";
import { requireUser } from "@/lib/auth";
import { formatCopper, formatPercent } from "@/lib/money";
import { capForUser, deals, movers, search, type MarketItem } from "@/lib/queries/market";

export const metadata = { title: "Market · Forever Gold" };

type SP = Promise<{ view?: string; q?: string }>;

export default function MarketPage({ searchParams }: { searchParams: SP }) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Header active="market" />
      <Suspense fallback={<p className="mt-8 text-muted">Loading the market…</p>}>
        <Market searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Market({ searchParams }: { searchParams: SP }) {
  await connection();
  const me = await requireUser();
  const { view: rawView, q = "" } = await searchParams;
  const view = q ? "search" : rawView === "movers" ? "movers" : "deals";

  return (
    <div className="mt-6">
      <form action="/market" className="flex max-w-md gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Find any item"
          aria-label="Find any item"
          className="w-full rounded border border-line bg-panel px-3 py-2 text-text outline-none focus:border-gold"
        />
        <button type="submit" className="rounded border border-line px-3 py-2 text-sm hover:border-gold">Search</button>
      </form>
      <nav className="mt-4 flex gap-2 text-sm">
        <Tab href="/market?view=deals" on={view === "deals"}>Cheap right now</Tab>
        <Tab href="/market?view=movers" on={view === "movers"}>Where the gold moves</Tab>
      </nav>
      <div className="mt-4">
        {view === "search" ? <Search q={q} /> : view === "movers" ? <Movers /> : <Deals userId={me.id} />}
      </div>
    </div>
  );
}

function Tab({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={`rounded border px-3 py-1.5 ${on ? "border-gold text-gold" : "border-line text-muted hover:text-text"}`}>
      {children}
    </Link>
  );
}

async function Deals({ userId }: { userId: string }) {
  const { cap, gold } = await capForUser(userId);
  const { items, trendSince } = await deals(cap);
  return (
    <>
      <p className="max-w-prose text-sm text-muted">
        Listed at least 25% under the usual price, selling well EU-wide (5+ a day, 40%+ of listings sell), and at most{" "}
        <span className="num text-text">{formatCopper(cap)}</span> each
        {gold !== null ? <> (10% of your {formatCopper(gold)})</> : <> (upload your TSM file to size this to your gold)</>}.
        The usual price is the lowest of TSM&apos;s market value, its long average and the EU average sale price.{" "}
        {trendSince ? "Items whose value fell over 10% in the last day are left out." : "With a day of history, items still sliding get left out; until then, check the item page before buying."}{" "}
        TSM does not say how many are listed at that price: there may be only one. For gear, TSM prices the base item:
        an &quot;of the Monkey&quot; and an &quot;of the Owl&quot; version can sell for very different amounts, so compare the exact
        one before buying.
      </p>
      <ItemList
        items={items}
        empty="Nothing cheap enough that sells well right now."
        extra={(i) => {
          const d = i as (typeof items)[number];
          return (
            <>
              <Cell label="Usual">{formatCopper(d.target)}</Cell>
              <Cell label="Profit each" good>+{formatCopper(d.profitEach)}</Cell>
            </>
          );
        }}
        extraHead={["Usual", "Profit each"]}
      />
      <p className="mt-2 text-xs text-muted">Profit is the usual price after the {formatPercent(SETTINGS.cut)} cut, minus what you pay.</p>
    </>
  );
}

async function Movers() {
  const { items } = await movers();
  return (
    <>
      <p className="max-w-prose text-sm text-muted">
        The most gold traded per day: units sold a day (EU average per auction house) times market value. This is where
        demand is, at every level, not a buy list.
      </p>
      <ItemList
        items={items}
        empty="No sales data yet."
        extra={(i) => <Cell label="Gold a day">{formatCopper((i as (typeof items)[number]).goldPerDay)}</Cell>}
        extraHead={["Gold a day"]}
      />
    </>
  );
}

async function Search({ q }: { q: string }) {
  const items = await search(q);
  return <ItemList items={items} empty={`No item on your market matches "${q}".`} />;
}

function ItemList({
  items,
  empty,
  extra,
  extraHead = [],
}: {
  items: MarketItem[];
  empty: string;
  extra?: (i: MarketItem) => React.ReactNode;
  extraHead?: string[];
}) {
  if (!items.length) return <p className="mt-4 text-muted">{empty}</p>;
  // Written out in full so Tailwind generates them.
  const cols = ["sm:grid-cols-[1fr_repeat(4,6.5rem)]", "sm:grid-cols-[1fr_repeat(5,6.5rem)]", "sm:grid-cols-[1fr_repeat(6,6.5rem)]"][extraHead.length];
  return (
    <ul className="mt-4 divide-y divide-line rounded border border-line text-sm">
      <li className={`hidden gap-3 bg-panel px-3 py-2 text-xs text-muted sm:grid ${cols}`}>
        <span>Item</span>
        <span className="text-right">Cheapest</span>
        <span className="text-right">Market value</span>
        <span className="text-right">Sells (EU)</span>
        <span className="text-right">Sold a day</span>
        {extraHead.map((h) => (
          <span key={h} className="text-right">{h}</span>
        ))}
      </li>
      {items.map((i) => (
        <li key={i.id} className={`grid grid-cols-2 gap-x-3 gap-y-1 px-3 py-2 ${cols}`}>
          <Link href={`/item/${i.id}`} className="col-span-2 font-medium hover:text-gold sm:col-span-1 sm:font-normal">
            {i.name}
          </Link>
          <Cell label="Cheapest">{formatCopper(i.minBuyout)}</Cell>
          <Cell label="Market value">{formatCopper(i.marketValue)}</Cell>
          <Cell label="Sells (EU)">{formatPercent(i.saleRate)}</Cell>
          <Cell label="Sold a day">{i.soldPerDay != null ? Math.round(i.soldPerDay).toLocaleString("en-US") : "-"}</Cell>
          {extra?.(i)}
        </li>
      ))}
    </ul>
  );
}

function Cell({ label, children, good }: { label: string; children: React.ReactNode; good?: boolean }) {
  return (
    <span className={`num flex justify-between gap-2 sm:block sm:text-right ${good ? "text-good" : ""}`}>
      <span className="text-xs text-muted sm:hidden">{label}</span>
      <span>{children}</span>
    </span>
  );
}
