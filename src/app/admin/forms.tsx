"use client";

import { useActionState } from "react";
import { createUser, resetPassword } from "@/lib/actions/admin";
import type { FormState } from "@/lib/actions/auth";
import { button, input, Message } from "@/components/form-bits";

export function CreateUserForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createUser, {});
  return (
    <form action={action} className="max-w-sm space-y-3">
      <input name="username" required placeholder="Username (their main's name works)" aria-label="Username" className={input} />
      <input name="password" required minLength={10} placeholder="Starting password (10+ characters)" aria-label="Starting password" className={input} />
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" name="admin" /> Admin (can manage accounts)
      </label>
      <button type="submit" disabled={pending} className={button}>{pending ? "Creating…" : "Create account"}</button>
      <Message state={state} />
    </form>
  );
}

export function ResetForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resetPassword, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input name="password" required minLength={10} placeholder="New password" aria-label="New password" className={`${input} max-w-48 py-1 text-sm`} />
      <button type="submit" disabled={pending} className="rounded border border-line px-2 py-1 text-xs text-muted hover:text-text">
        Reset
      </button>
      <Message state={state} />
    </form>
  );
}
