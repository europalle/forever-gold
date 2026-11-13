import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { Card, Empty, How, ItemIcon, ItemName, Money, PageTitle, Pct, Tabs } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { craftView } from "@/lib/queries/crafting";

export const metadata = { title: "Crafting · Forever Gold" };

type SP = Promise<{ p?: string; mine?: string }>;

export default function CraftingPage({ searchParams }: { searchParams: SP }) {
  return (
    <main className="mx-auto max-w-[1360px] px-4 pb-16 sm:px-8">
      <Header active="crafting" />
      <Suspense fallback={<div className="pt-7" aria-busy="true"><div className="skeleton h-8 w-40" /><div className="skeleton mt-6 h-[520px]" /></div>}>
        <Crafting searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Crafting({ searchParams }: { searchParams: SP }) {
  await connection();
  const me = await requireUser();
  const { p, mine } = await searchParams;
  const onlyMine = mine === "1";
  const v = await craftView(me.id, p ?? null, onlyMine);
  const href = (prof: string | null, m: boolean) => `/crafting?${new URLSearchParams({ ...(prof ? { p: prof } : {}), ...(m ? { mine: "1" } : {}) })}`;
  const winners = v.rows.filter((r) => r.profit > 0);
  const best = winners[0];

  return (
    <>
      <PageTitle
        title="Crafting"
        action={
          <How label="How profit is worked out">
            <p>
              Cost: every reagent at the cheaper of the cheapest listing and a vendor the guild has seen. Revenue: the output&apos;s cheapest listing after the 5% cut.
              Gold a day assumes you supply a tenth of what sells here in a day; without measured sales the list ranks by profit each. Recipes come from
              Blizzard&apos;s game data and from profession windows the guild&apos;s addons have read. Enchants that make no item are left out.
            </p>
          </How>
        }
      >
        {v.total === 0 ? (
          v.fromBlizzard === 0 ? "No recipes yet. Blizzard's recipe data loads in batches after each collection." : "Nothing priced for this filter."
        ) : best ? (
          <>
            {winners.length} of {v.rows.length} shown make money. Best: {best.name}, <Money c={best.profit} sign className="text-good" /> each
            {best.perDay != null ? <>, about <Money c={best.perDay} /> a day</> : null}.
          </>
        ) : (
          "Nothing here beats buying the output right now."
        )}
      </PageTitle>

      <div className="flex flex-wrap items-end gap-x-10 border-b border-line">
        <Tabs
          className="!border-0"
          items={[
            { href: href(null, onlyMine), label: "All", on: !p },
            ...v.professions.map((x) => ({
              href: href(x.name, onlyMine),
              label: (
                <>
                  {x.name}
                  {x.mine != null ? <span className="num ml-1.5 text-xs text-muted">{x.mine}</span> : null}
                </>
              ),
              on: p === x.name,
            })),
          ]}
        />
        <Tabs
          className="ml-auto !border-0"
          items={[
            { href: href(p ?? null, false), label: "Every recipe", on: !onlyMine },
            { href: href(p ?? null, true), label: "Learned", on: onlyMine },
          ]}
        />
      </div>

      <Card className="rise rise-2 mt-5">
        {v.rows.length === 0 ? (
          <Empty>{onlyMine ? "No learned recipe is priced. Open your profession windows in game so the addon reads them." : "No recipes priced."}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="data min-w-[980px]">
              <thead>
                <tr>
                  <th>Makes</th>
                  <th>From</th>
                  <th className="r">Cost</th>
                  <th className="r">Sells for</th>
                  <th className="r">Profit each</th>
                  <th className="r">Margin</th>
                  <th className="r" title="Units of the output sold a day on this auction house">Sold a day</th>
                  <th className="r" title="Profit a day at a tenth of what sells">Gold a day</th>
                </tr>
              </thead>
              <tbody>
                {v.rows.map((r) => (
                  <tr key={r.key}>
                    <td className="max-w-[280px]">
                      <ItemName id={r.outputId} name={v.names.get(r.outputId) || r.name} quality={v.meta.get(r.outputId)?.quality} icon={v.meta.get(r.outputId)?.icon} className="max-w-full" />
                      <div className="mt-0.5 text-xs text-muted">
                        {r.profession}
                        {r.outputQty !== 1 ? <span className="num"> x{r.outputQty}</span> : null}
                        {r.known ? <span className="text-good"> · learned</span> : null}
                      </div>
                    </td>
                    <td>
                      <ul className="flex flex-wrap gap-x-3 gap-y-1">
                        {r.reagents.map(([id, qty]) => (
                          <li key={id}>
                            <Link href={`/item/${id}`} className="inline-flex items-center gap-1.5 text-muted hover:text-text" title={v.names.get(id) ?? `Item ${id}`}>
                              <ItemIcon icon={v.meta.get(id)?.icon} quality={v.meta.get(id)?.quality} size={18} />
                              <span className="num">{qty}</span>
                              <span className="max-w-[9rem] truncate">{v.names.get(id) ?? `Item ${id}`}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="r"><Money c={r.cost} className="text-muted" /></td>
                    <td className="r"><Money c={r.revenue} className="text-muted" /></td>
                    <td className="r"><Money c={r.profit} sign className={r.profit > 0 ? "text-good" : "text-bad"} /></td>
                    <td className="r"><Pct v={r.margin} /></td>
                    <td className="r num text-muted">{r.soldHere != null ? (r.soldHere < 10 ? r.soldHere.toFixed(1) : Math.round(r.soldHere).toLocaleString("en-US")) : "-"}</td>
                    <td className="r"><Money c={r.perDay != null && r.profit > 0 ? r.perDay : null} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {v.total > v.rows.length ? <p className="border-t border-rule px-4 py-2.5 text-xs text-muted">Top {v.rows.length} of {v.total}. Pick a profession for the rest.</p> : null}
      </Card>
    </>
  );
}
