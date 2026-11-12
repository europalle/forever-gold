"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Result = {
  kind?: "tsm" | "addon";
  ledgerRows?: number;
  newLedgerRows?: number;
  goldPoints?: number;
  characters?: string[];
  items?: number;
  newInvoices?: number;
  error?: string;
};

async function gzip(file: File): Promise<Blob> {
  const stream = file.stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).blob();
}

export function TsmUpload() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMsg({});
    try {
      const res = await fetch("/api/upload/tsm", {
        method: "POST",
        headers: { "X-FG-Encoding": "gzip", "Content-Type": "application/octet-stream" },
        body: await gzip(file),
      });
      const r = (await res.json()) as Result;
      if (!res.ok) setMsg({ error: r.error ?? `Upload failed (${res.status}).` });
      else {
        const who = (r.characters ?? []).join(" and ");
        setMsg({
          ok:
            r.kind === "addon"
              ? `Read the addon's file for ${who}: ${r.items} item details, ${r.newInvoices} new sale mails.`
              : `Read ${r.ledgerRows} ledger rows for ${who}: ${r.newLedgerRows} new. Gold history: ${r.goldPoints} points.`,
        });
        router.refresh();
      }
    } catch {
      setMsg({ error: "Upload failed. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded border border-line bg-panel p-3 text-sm">
      <label className="flex flex-wrap items-center gap-3">
        <span className="rounded bg-gold px-3 py-2 font-medium text-bg">{busy ? "Reading…" : "Upload a saved file"}</span>
        <input
          type="file"
          accept=".lua"
          disabled={busy}
          className="sr-only"
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <span className="text-muted">
          <code className="text-text">TradeSkillMaster.lua</code> or <code className="text-text">ForeverGold.lua</code>, from{" "}
          <code className="text-text">World of Warcraft\_forever_\WTF\Account\&lt;account&gt;\SavedVariables</code>. Log out first
          so it is current. The helper program does this for you.
        </span>
      </label>
      {msg.ok ? <p className="mt-2 text-good">{msg.ok}</p> : null}
      {msg.error ? <p className="mt-2 text-bad">{msg.error}</p> : null}
    </div>
  );
}
