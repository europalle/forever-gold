"use client";

import { useActionState } from "react";
import { login, type FormState } from "@/lib/actions/auth";

export function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(login, {});
  const input = "field";
  return (
    <form action={action} className="mt-6 space-y-3">
      <input name="username" autoComplete="username" autoFocus required aria-label="Username" placeholder="Username" className={input} />
      <input type="password" name="password" autoComplete="current-password" required aria-label="Password" placeholder="Password" className={input} />
      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "Checking…" : "Sign in"}
      </button>
      {state.error ? <p className="text-sm text-bad">{state.error}</p> : null}
    </form>
  );
}
