"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Candidate = { houseId: number; name: string; commodityRows: number; score: number; compared: number; normalScore?: number };
type Result = {
  error?: string;
  note?: string;
  ruleset?: { id: number; name?: string };
  candidates?: Candidate[];
  buyout?: { perUnit: boolean; stacked: number; perUnitScore: number; perStackScore: number } | null;
};

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function BlizzardDiscovery() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<Result | null>(null);

  async function post(body: object) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/blizzard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = (await res.json()) as Result;
      if (!("action" in body)) setR(j);
      router.refresh();
    } catch {
      setR({ error: "The request failed. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <button type="button" disabled={busy} onClick={() => post({})} className="rounded bg-gold px-3 py-2 font-medium text-bg disabled:opacity-60">
        {busy ? "Comparing auction houses… (up to a minute)" : "Find my auction house"}
      </button>
      {r?.error ? <p className="text-bad">{r.error}</p> : null}
      {r?.note ? <p className={r.buyout ? "text-good" : "text-warn"}>{r.note}</p> : null}
      {r?.buyout ? (
        <p className="text-muted">
          {r.buyout.stacked === 0
            ? "No stacked item auctions: stackable goods all trade as commodities, so per unit or per stack does not matter."
            : `Item auction prices: ${r.buyout.perUnit ? "per unit" : "per stack"} (${r.buyout.stacked} stacked auctions compared; per unit ${pct(r.buyout.perUnitScore)}, per stack ${pct(r.buyout.perStackScore)} agreement).`}
        </p>
      ) : null}
      {r?.candidates?.length ? (
        <ul className="divide-y divide-line rounded border border-line">
          {r.candidates.map((c) => (
            <li key={c.houseId} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
              <span>
                {c.name} <span className="text-muted">· house {c.houseId} · {c.commodityRows.toLocaleString("en-US")} listings</span>
              </span>
              <span className="flex items-center gap-3">
                <span className="num">
                  PvP {pct(c.score)} of {c.compared}
                  {c.normalScore !== undefined ? <span className="text-muted"> · Normal {pct(c.normalScore)}</span> : null}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => post({ action: "choose", rulesetId: r.ruleset!.id, houseId: c.houseId, houseName: c.name, buyoutPerUnit: r.buyout?.perUnit ?? false })}
                  className="rounded border border-line px-2 py-1 text-xs text-muted hover:text-text"
                >
                  Use this one
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
