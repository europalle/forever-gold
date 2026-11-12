import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { requireUser } from "@/lib/auth";
import { formatCopper, formatPercent } from "@/lib/money";
import { disenchantResearch, trainerResearch, vendorResearch, yieldResearch } from "@/lib/queries/research";
import type { Drop } from "@/lib/research";

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
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Header active="research" />
      <Suspense fallback={<p className="mt-8 text-muted">Loading…</p>}>
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
    <div className="mt-6">
      <p className="max-w-prose text-sm text-muted">
        What the guild&apos;s addons recorded while playing: loot windows, disenchants, vendors and trainers. Pooled across
        everyone, so it gets better the more people run the addon. Shares are the share of loot windows that held the item.
      </p>
      <nav className="mt-4 flex flex-wrap gap-2 text-sm">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/research?tab=${k}`} className={`rounded border px-3 py-1.5 ${k === tab ? "border-gold text-gold" : "border-line text-muted hover:text-text"}`}>
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-5">
        {tab === "disenchant" ? <Disenchant /> : tab === "vendors" ? <Vendors /> : tab === "trainers" ? <Trainers /> : <Yields kind={tab} />}
      </div>
    </div>
  );
}

const QUALITY = ["Poor", "Common", "Uncommon", "Rare", "Epic", "Legendary"];
const qualityColor = ["text-muted", "text-text", "text-good", "text-[#5a95e0]", "text-[#a335ee]", "text-warn"];

function Drops({ drops, names }: { drops: Drop[]; names: Map<number, string> }) {
  return (
    <ul className="mt-2 space-y-0.5 text-sm">
      {drops.slice(0, 8).map((d) => (
        <li key={d.itemId} className="flex justify-between gap-3">
          <Link href={`/item/${d.itemId}`} className="hover:text-gold">{names.get(d.itemId) ?? `Item ${d.itemId}`}</Link>
          <span className="num text-muted">
            {formatPercent(d.share)} · avg {d.avgQty.toFixed(1)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Empty({ what }: { what: string }) {
  return (
    <p className="text-muted">
      Nothing recorded yet. {what} with addon 0.2.0 or newer, then /reload or log out so the helper uploads it.
    </p>
  );
}

async function Disenchant() {
  const { total, table, names } = await disenchantResearch();
  if (!table.length) return <Empty what={total ? "Item details for the disenchanted items are still coming in. Keep playing" : "Disenchant some greens"} />;
  return (
    <>
      <p className="mb-3 text-sm text-muted">{total} disenchants recorded. Grouped by the item&apos;s quality, armor or weapon, and required level.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {table.map((g) => (
          <section key={`${g.quality}${g.type}${g.bracket}`} className="rounded border border-line bg-panel p-3">
            <h3 className="flex justify-between text-sm">
              <span>
                <span className={qualityColor[g.quality]}>{QUALITY[g.quality]}</span> {g.type}, level {g.bracket}
              </span>
              <span className="num text-muted">{g.n}</span>
            </h3>
            <Drops drops={g.drops} names={names} />
          </section>
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
      <p className="mb-3 text-sm text-muted">
        {total} recorded. Per mob or node, most-sampled first. Mob names show when the mob was targeted.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {table.map((m) => (
          <section key={m.npcId} className="rounded border border-line bg-panel p-3">
            <h3 className="flex justify-between gap-2 text-sm">
              <span className="font-medium">
                {m.name ?? `NPC ${m.npcId}`}
                {m.levels ? <span className="text-muted"> · level {m.levels[0] === m.levels[1] ? m.levels[0] : `${m.levels[0]}-${m.levels[1]}`}</span> : null}
              </span>
              <span className="num text-muted">{m.n}</span>
            </h3>
            <Drops drops={m.drops} names={names} />
          </section>
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
      <p className="mb-3 max-w-prose text-sm text-muted">
        {vendors} vendors, {items} items recorded. These sell for less than the cheapest auction house listing pays after the cut.
        Limited stock restocks slowly; check that the item really sells before buying many.
      </p>
      {flips.length ? (
        <ul className="divide-y divide-line rounded border border-line text-sm">
          {flips.map((f) => (
            <li key={f.itemId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2">
              <span>
                <Link href={`/item/${f.itemId}`} className="font-medium hover:text-gold">{names.get(f.itemId) ?? `Item ${f.itemId}`}</Link>
                <span className="text-muted"> · {f.vendor ?? "vendor"}{f.stock != null && f.stock >= 0 ? ` · ${f.stock} in stock` : ""}</span>
              </span>
              <span className="num">
                {formatCopper(f.unitCost)} <span className="text-muted">to</span> {formatCopper(f.cheapest)}{" "}
                <span className="text-good">+{formatCopper(f.profit)}</span>
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
    <ul className="divide-y divide-line rounded border border-line text-sm">
      {services.map((s) => (
        <li key={`${s.npcId}${s.name}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2">
          <span>
            {s.itemId ? <Link href={`/item/${s.itemId}`} className="hover:text-gold">{s.name}</Link> : s.name}
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
