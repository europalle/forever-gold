import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { SETTINGS } from "@/config/settings";
import { requireUser } from "@/lib/auth";
import { formatCopper, formatPercent } from "@/lib/money";
import { capForUser, deals, levelWindowFor, movers, search, type LevelWindow, type MarketItem } from "@/lib/queries/market";

export const metadata = { title: "Market · Forever Gold" };

type SP = Promise<{ view?: string; q?: string; levels?: string }>;

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
  const { view: rawView, q = "", levels } = await searchParams;
  const view = q ? "search" : rawView === "movers" ? "movers" : "deals";
  const near = levels === "near";
  const lw = await levelWindowFor(me.id);
  const level: LevelWindow = near ? lw.window : null;
  const href = (v: string, n: boolean) => `/market?view=${v}${n ? "&levels=near" : ""}`;

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
      <nav className="mt-4 flex flex-wrap gap-2 text-sm">
        <Tab href={href("deals", near)} on={view === "deals"}>Cheap right now</Tab>
        <Tab href={href("movers", near)} on={view === "movers"}>Where the gold moves</Tab>
        <span className="mx-1 self-center text-line">|</span>
        <Tab href={href(view === "movers" ? "movers" : "deals", false)} on={!near}>All levels</Tab>
        <Tab href={href(view === "movers" ? "movers" : "deals", true)} on={near}>
          Around my level{lw.level ? ` (${lw.window!.min}-${lw.window!.max})` : ""}
        </Tab>
      </nav>
      {near && (!lw.level || lw.known === 0) ? (
        <p className="mt-4 max-w-prose text-sm text-warn">
          {!lw.level
            ? "Your level comes from the addon: install it and let the helper upload once."
            : "Item levels come from the addon: once it has looked items up and the helper has uploaded, this filter fills in."}
        </p>
      ) : null}
      <div className="mt-4">
        {view === "search" ? <Search q={q} /> : view === "movers" ? <Movers level={level} /> : <Deals userId={me.id} level={level} />}
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

async function Deals({ userId, level }: { userId: string; level: LevelWindow }) {
  const { cap, gold } = await capForUser(userId);
  const { items, trendSince } = await deals(cap, 40, level);
  return (
    <>
      <p className="max-w-prose text-sm text-muted">
        Listed at least 25% under the usual price, selling well EU-wide (5+ a day, 40%+ of listings sell), and at most{" "}
        <span className="num text-text">{formatCopper(cap)}</span> each
        {gold !== null ? <> (10% of your {formatCopper(gold)})</> : <> (upload your TSM file to size this to your gold)</>}.
        The usual price is the lowest of TSM&apos;s market value, its long average and the EU average sale price.{" "}
        {trendSince ? "Items whose value fell over 10% in the last day are left out." : "With a day of history, items still sliding get left out; until then, check the item page before buying."}{" "}
        &quot;Listed at it&quot; comes from Blizzard&apos;s hourly listing, once collected; without it there may be only one. For gear, TSM prices the base item:
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
              <Cell label="Listed at that price">{d.listedAtMin != null ? d.listedAtMin.toLocaleString("en-US") : "-"}</Cell>
              <Cell label="Usual">{formatCopper(d.target)}</Cell>
              <Cell label="Profit each" good>+{formatCopper(d.profitEach)}</Cell>
            </>
          );
        }}
        extraHead={["Listed at it", "Usual", "Profit each"]}
      />
      <p className="mt-2 text-xs text-muted">Profit is the usual price after the {formatPercent(SETTINGS.cut)} cut, minus what you pay.</p>
    </>
  );
}

async function Movers({ level }: { level: LevelWindow }) {
  const { items } = await movers(40, level);
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
  const cols = ["sm:grid-cols-[1fr_repeat(4,6.5rem)]", "sm:grid-cols-[1fr_repeat(5,6.5rem)]", "sm:grid-cols-[1fr_repeat(6,6.5rem)]", "sm:grid-cols-[1fr_repeat(7,6.5rem)]"][extraHead.length];
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
