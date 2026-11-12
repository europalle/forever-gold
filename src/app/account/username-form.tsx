"use client";

import { useActionState } from "react";
import { changeUsername, type FormState } from "@/lib/actions/auth";
import { button, input, Message } from "@/components/form-bits";

export function UsernameForm({ current }: { current: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(changeUsername, {});
  return (
    <form action={action} className="max-w-sm space-y-3">
      <input name="username" required defaultValue={current} aria-label="Username" className={input} />
      <button type="submit" disabled={pending} className={button}>{pending ? "Saving…" : "Change username"}</button>
      <Message state={state} />
    </form>
  );
}
