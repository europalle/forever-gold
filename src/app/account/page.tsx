import { connection } from "next/server";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { removeDevice } from "@/lib/actions/devices";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PairForm } from "./pair-form";
import { PasswordForm } from "./password-form";
import { UsernameForm } from "./username-form";

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
  const devices = await db.device.findMany({ where: { userId: me.id }, orderBy: { createdAt: "asc" } });
  return (
    <div className="mt-6 space-y-8">
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Signed in as</h2>
        <p className="mt-1">
          {me.displayName} <span className="text-muted">({me.username}, {me.role === "ADMIN" ? "admin" : "member"})</span>
        </p>
      </section>
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Username</h2>
        <UsernameForm current={me.displayName} />
      </section>
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Password</h2>
        <PasswordForm />
      </section>
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Helper program</h2>
        <p className="mb-3 max-w-prose text-sm text-muted">
          The helper runs on your PC: it uploads your addon and TSM files when the game saves them, and keeps the addon&apos;s
          advice fresh. Make a pairing code and paste it into the helper the first time it starts.
        </p>
        {devices.length ? (
          <ul className="mb-4 max-w-xl divide-y divide-line rounded border border-line text-sm">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span>
                  {d.name}{" "}
                  <span className="text-muted">
                    · paired {d.createdAt.toISOString().slice(0, 10)} · last seen{" "}
                    {d.lastSeenAt ? d.lastSeenAt.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "never"}
                  </span>
                </span>
                <form action={removeDevice}>
                  <input type="hidden" name="id" value={d.id} />
                  <button type="submit" className="rounded border border-line px-2 py-1 text-xs text-muted hover:text-text">Disconnect</button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}
        <PairForm />
      </section>
    </div>
  );
}
