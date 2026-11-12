import { connection } from "next/server";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { requireUser } from "@/lib/auth";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Account · Forever Gold" };

export default function AccountPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Header active="account" />
      <Suspense fallback={<p className="mt-8 text-muted">Loading…</p>}>
        <Account />
      </Suspense>
    </main>
  );
}

async function Account() {
  await connection();
  const me = await requireUser();
  return (
    <div className="mt-6 space-y-8">
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Signed in as</h2>
        <p className="mt-1">
          {me.displayName} <span className="text-muted">({me.username}, {me.role === "ADMIN" ? "admin" : "member"})</span>
        </p>
      </section>
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Password</h2>
        <PasswordForm />
      </section>
    </div>
  );
}
