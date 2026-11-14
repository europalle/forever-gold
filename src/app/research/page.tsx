import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { requireUser } from "@/lib/auth";
import { formatCopper, formatPercent } from "@/lib/money";
import { disenchantResearch, trainerResearch, vendorResearch, yieldResearch } from "@/lib/queries/research";
import type { Drop } from "@/lib/research";
import { Card, Money, PageTitle, Tabs } from "@/components/ui";

export const metadata = { title: "Research · Forever Gold" };

const TABS = [
  ["disenchant", "Disenchanting"],
  ["skin", "Skinning"],
  ["herb", "Herbs"],
  ["mine", "Ore"],
  ["fish", "Fishing"],
  ["vendors", "Vendor flips"],
  ["trainers", "Trainers"],
] as const;

type SP = Promise<{ tab?: string }>;

export default function ResearchPage({ searchParams }: { searchParams: SP }) {
  return (
    <main className="mx-auto max-w-[1360px] px-4 pb-16 sm:px-8">
      <Header active="research" />
      <Suspense fallback={<div className="pt-7" aria-busy="true"><div className="skeleton h-8 w-40" /><div className="skeleton mt-6 h-96" /></div>}>
        <Research searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Research({ searchParams }: { searchParams: SP }) {
  await connection();
  await requireUser();
  const { tab: raw } = await searchParams;
  const tab = TABS.some(([k]) => k === raw) ? raw! : "disenchant";
  return (
    <>
      <PageTitle title="Research">Drop and disenchant rates, vendor prices and trainer costs, pooled from the guild&apos;s addons.</PageTitle>
      <Tabs items={TABS.map(([k, label]) => ({ href: `/research?tab=${k}`, label, on: k === tab }))} />
      <div className="rise rise-2 mt-5">
        {tab === "disenchant" ? <Disenchant /> : tab === "vendors" ? <Vendors /> : tab === "trainers" ? <Trainers /> : <Yields kind={tab} />}
      </div>
    </>
  );
}

const QUALITY = ["Poor", "Common", "Uncommon", "Rare", "Epic", "Legendary"];
const qualityColor = ["text-muted", "text-text", "text-[#1eff00]", "text-[#3a8dff]", "text-[#b048f8]", "text-warn"];

// Each drop: how often it shows up, as a bar, and how many at a time.
function Drops({ drops, names }: { drops: Drop[]; names: Map<number, string> }) {
  return (
    <ul className="px-4 pb-4">
      {drops.slice(0, 8).map((d) => (
        <li key={d.itemId} className="grid h-7 grid-cols-[minmax(0,1fr)_5rem_2.75rem_2.5rem] items-center gap-3">
          <Link href={`/item/${d.itemId}`} className="truncate hover:underline">{names.get(d.itemId) ?? `Item ${d.itemId}`}</Link>
          <span className="h-1.5 rounded-sm bg-raised">
            <span className="block h-1.5 rounded-sm bg-gold" style={{ width: `${Math.min(100, d.share * 100)}%` }} />
          </span>
          <span className="num text-right">{formatPercent(d.share)}</span>
          <span className="num text-right text-muted" title="Average per drop">x{d.avgQty.toFixed(1)}</span>
        </li>
      ))}
    </ul>
  );
}

function Empty({ what }: { what: string }) {
  return (
    <p className="text-muted">Nothing recorded yet. {what}, then /reload or log out so the app uploads it.</p>
  );
}

async function Disenchant() {
  const { total, table, names } = await disenchantResearch();
  if (!table.length) return <Empty what={total ? "Item details for the disenchanted items are still coming in. Keep playing" : "Disenchant some greens"} />;
  return (
    <>
      <p className="mb-3 text-sm text-muted"><span className="num text-text">{total}</span> disenchants</p>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {table.map((g) => (
          <Card
            key={`${g.quality}${g.type}${g.bracket}`}
            title={<><span className={qualityColor[g.quality]}>{QUALITY[g.quality]}</span> {g.type.toLowerCase()}, level {g.bracket}</>}
            action={<span className="num text-muted" title="Disenchants recorded">{g.n}</span>}
          >
            <Drops drops={g.drops} names={names} />
          </Card>
        ))}
      </div>
    </>
  );
}

async function Yields({ kind }: { kind: string }) {
  const { total, table, names } = await yieldResearch(kind);
  const what = { skin: "Skin some beasts", herb: "Pick some herbs", mine: "Mine some ore", fish: "Do some fishing" }[kind] ?? "Play";
  if (!table.length) return <Empty what={what} />;
  return (
    <>
      <p className="mb-3 text-sm text-muted"><span className="num text-text">{total}</span> recorded. Worth per kill or node at today's cheapest listings; 5+ samples first</p>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {table.map((m) => (
          <Card
            key={m.npcId}
            title={m.name ?? `NPC ${m.npcId}`}
            note={m.levels ? `Level ${m.levels[0] === m.levels[1] ? m.levels[0] : `${m.levels[0]}-${m.levels[1]}`}` : undefined}
            action={
              <span className="text-right">
                <Money c={m.value || null} />
                <span className="num ml-2 text-xs text-muted" title="Times recorded">n {m.n}</span>
              </span>
            }
          >
            <Drops drops={m.drops} names={names} />
          </Card>
        ))}
      </div>
    </>
  );
}

async function Vendors() {
  const { vendors, items, flips, names } = await vendorResearch();
  if (!items) return <Empty what="Open some vendors" />;
  return (
    <>
      <p className="mb-3 text-sm text-muted">
        <span className="num text-text">{vendors}</span> vendors, <span className="num text-text">{items}</span> items. Cheaper at the vendor than the auction house pays after the cut.
      </p>
      {flips.length ? (
        <ul className="card rows text-sm">
          {flips.map((f) => (
            <li key={f.itemId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2">
              <span>
                <Link href={`/item/${f.itemId}`} className="font-medium hover:underline">{names.get(f.itemId) ?? `Item ${f.itemId}`}</Link>
                <span className="text-muted"> · {f.vendor ?? "vendor"}{f.stock != null && f.stock >= 0 ? ` · ${f.stock} in stock` : ""}</span>
              </span>
              <span className="num">
                <Money c={f.unitCost} /> <span className="text-muted">to</span> <Money c={f.cheapest} />{" "}
                <span className="text-good">+<Money c={f.profit} /></span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">No vendor item currently sells for more on the auction house.</p>
      )}
    </>
  );
}

async function Trainers() {
  const services = await trainerResearch();
  if (!services.length) return <Empty what="Talk to some profession trainers" />;
  return (
    <ul className="card rows text-sm">
      {services.map((s) => (
        <li key={`${s.npcId}${s.name}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2">
          <span>
            {s.itemId ? <Link href={`/item/${s.itemId}`} className="hover:underline">{s.name}</Link> : s.name}
            <span className="text-muted">
              {" "}
              · {s.skill ?? "?"} {s.skillLevel ?? ""}
              {s.levelReq ? ` · level ${s.levelReq}` : ""} · {s.trainerName ?? "trainer"}
            </span>
          </span>
          <span className="num">{s.cost != null ? formatCopper(s.cost) : "-"}</span>
        </li>
      ))}
    </ul>
  );
}
