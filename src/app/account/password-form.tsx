"use client";

import { useActionState } from "react";
import { changePassword, type FormState } from "@/lib/actions/auth";
import { button, input, Message } from "@/components/form-bits";

export function PasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changePassword, {});
  return (
    <form action={action} className="max-w-sm space-y-3">
      <input type="password" name="current" autoComplete="current-password" required placeholder="Current password" aria-label="Current password" className={input} />
      <input type="password" name="next" autoComplete="new-password" required placeholder="New password (10+ characters)" aria-label="New password" className={input} />
      <input type="password" name="again" autoComplete="new-password" required placeholder="New password again" aria-label="New password again" className={input} />
      <button type="submit" disabled={pending} className={button}>{pending ? "Saving…" : "Change password"}</button>
      <Message state={state} />
    </form>
  );
}
