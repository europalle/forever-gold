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
    <div className="flex flex-col items-end gap-1">
      <label title="TradeSkillMaster.lua or ForeverGold.lua from WTF\\Account\\<account>\\SavedVariables, after logging out. The app does this for you.">
        <span className="btn cursor-pointer">{busy ? "Reading…" : "Upload a saved file"}</span>
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
      </label>
      {msg.ok ? <p className="text-xs text-good">{msg.ok}</p> : null}
      {msg.error ? <p className="text-xs text-bad">{msg.error}</p> : null}
    </div>
  );
}
