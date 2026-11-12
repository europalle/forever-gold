"use client";

import { useActionState } from "react";
import { acceptInvite } from "@/lib/actions/invite";
import type { FormState } from "@/lib/actions/auth";
import { button, input, Message } from "@/components/form-bits";

export function InviteForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(acceptInvite, {});
  return (
    <form action={action} className="mt-6 space-y-3">
      <input type="hidden" name="token" value={token} />
      <input name="username" autoComplete="username" autoFocus required placeholder="Username (your main's name works)" aria-label="Username" className={input} />
      <input type="password" name="password" autoComplete="new-password" required placeholder="Password (10+ characters)" aria-label="Password" className={input} />
      <input type="password" name="again" autoComplete="new-password" required placeholder="Password again" aria-label="Password again" className={input} />
      <button type="submit" disabled={pending} className={`${button} w-full py-2`}>{pending ? "Creating…" : "Create my account"}</button>
      <Message state={state} />
    </form>
  );
}
