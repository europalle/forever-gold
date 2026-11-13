"use client";

import { useActionState, useRef, useState } from "react";
import { createInvite, resetPassword, type InviteFormState } from "@/lib/actions/admin";
import type { FormState } from "@/lib/actions/auth";
import { button, input, Message } from "@/components/form-bits";

export function InviteForm() {
  const [state, action, pending] = useActionState<InviteFormState, FormData>(createInvite, {});
  const [copied, setCopied] = useState<{ link: string; how: "copied" | "manual" } | null>(null);
  const linkRef = useRef<HTMLInputElement>(null);

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied({ link, how: "copied" });
    } catch {
      // Some browsers refuse clipboard access: select it for Ctrl+C instead.
      linkRef.current?.focus();
      linkRef.current?.select();
      setCopied({ link, how: "manual" });
    }
  }
  return (
    <div className="max-w-xl space-y-3">
      <form action={action} className="space-y-3">
        <input name="note" maxLength={60} placeholder="Who is it for? (optional, for your list)" aria-label="Who is it for" className={`${input} max-w-sm`} />
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" name="admin" /> Make them an admin (can invite and manage accounts)
        </label>
        <button type="submit" disabled={pending} className={button}>{pending ? "Creating…" : "Create invite link"}</button>
      </form>
      <Message state={state} />
      {state.link ? (
        <div className="flex flex-wrap items-center gap-2">
          <input ref={linkRef} readOnly value={state.link} aria-label="Invite link" onFocus={(e) => e.target.select()} className={`${input} num flex-1 text-sm`} />
          <button type="button" className="btn" onClick={() => void copy(state.link!)}>
            {copied?.link === state.link ? (copied.how === "copied" ? "Copied" : "Press Ctrl+C") : "Copy"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function ResetForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resetPassword, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input name="password" required minLength={10} placeholder="New password" aria-label="New password" className={`${input} max-w-48 py-1 text-sm`} />
      <button type="submit" disabled={pending} className="btn btn-small">
        Reset
      </button>
      <Message state={state} />
    </form>
  );
}
