"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Result = { ledgerRows: number; newLedgerRows: number; goldPoints: number; characters: string[]; error?: string };

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
        setMsg({
          ok: `Read ${r.ledgerRows} ledger rows for ${r.characters.join(" and ")}: ${r.newLedgerRows} new. Gold history: ${r.goldPoints} points.`,
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
        <span className="rounded bg-gold px-3 py-2 font-medium text-bg">{busy ? "Reading…" : "Upload TradeSkillMaster.lua"}</span>
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
          In <code className="text-text">World of Warcraft\_forever_\WTF\Account\&lt;account&gt;\SavedVariables</code>. Log out first so
          it is current.
        </span>
      </label>
      {msg.ok ? <p className="mt-2 text-good">{msg.ok}</p> : null}
      {msg.error ? <p className="mt-2 text-bad">{msg.error}</p> : null}
    </div>
  );
}
