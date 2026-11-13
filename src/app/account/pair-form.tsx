"use client";

import { useActionState, useRef, useState } from "react";
import { createDevice, type PairState } from "@/lib/actions/devices";
import { button, input, Message } from "@/components/form-bits";

export function PairForm() {
  const [state, action, pending] = useActionState<PairState, FormData>(createDevice, {});
  const ref = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <div className="max-w-xl space-y-3">
      <form action={action} className="flex flex-wrap gap-2">
        <input name="name" maxLength={40} placeholder="Name this PC (optional)" aria-label="PC name" className={`${input} max-w-xs`} />
        <button type="submit" disabled={pending} className={button}>{pending ? "Making…" : "Make a pairing code"}</button>
      </form>
      <Message state={state} />
      {state.code ? (
        <div className="flex flex-wrap items-center gap-2">
          <input ref={ref} readOnly value={state.code} aria-label="Pairing code" onFocus={(e) => e.target.select()} className={`${input} num flex-1 text-sm`} />
          <button
            type="button"
            className="btn"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(state.code!);
                setCopied("Copied");
              } catch {
                ref.current?.select();
                setCopied("Press Ctrl+C");
              }
            }}
          >
            {copied ?? "Copy"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
