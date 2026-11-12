"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/lib/actions/auth";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="mt-6 space-y-3">
      <input
        type="password"
        name="password"
        autoComplete="current-password"
        autoFocus
        required
        aria-label="Password"
        placeholder="Password"
        className="w-full rounded border border-line bg-panel px-3 py-2 text-text outline-none focus:border-gold"
      />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-gold px-3 py-2 font-medium text-bg disabled:opacity-60"
      >
        {pending ? "Checking…" : "Sign in"}
      </button>
      {state.error ? <p className="text-sm text-bad">{state.error}</p> : null}
    </form>
  );
}
