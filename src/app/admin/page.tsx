import { connection } from "next/server";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { deleteUser } from "@/lib/actions/admin";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { CreateUserForm, ResetForm } from "./forms";

export const metadata = { title: "Admin · Forever Gold" };

export default function AdminPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Header active="admin" />
      <Suspense fallback={<p className="mt-8 text-muted">Loading…</p>}>
        <Admin />
      </Suspense>
    </main>
  );
}

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "never");

async function Admin() {
  await connection();
  const me = await requireAdmin();
  const users = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      lastLoginAt: true,
      uploads: { orderBy: { at: "desc" }, take: 1, select: { at: true } },
    },
  });
  return (
    <div className="mt-6 space-y-10">
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Guild accounts</h2>
        <ul className="divide-y divide-line rounded border border-line">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div>
                <span className="font-medium">{u.displayName}</span>{" "}
                <span className="text-sm text-muted">
                  {u.username} · {u.role === "ADMIN" ? "admin" : "member"} · last sign-in {day(u.lastLoginAt)} · last TSM upload{" "}
                  {day(u.uploads[0]?.at)}
                </span>
              </div>
              {u.id === me.id ? (
                <span className="text-xs text-muted">you</span>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <ResetForm id={u.id} />
                  <form action={deleteUser}>
                    <input type="hidden" name="id" value={u.id} />
                    <button type="submit" className="rounded border border-line px-2 py-1 text-xs text-bad hover:border-bad">
                      Delete
                    </button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Add a guildie</h2>
        <CreateUserForm />
        <p className="mt-3 max-w-prose text-sm text-muted">
          Accounts are private: there is no sign-up page. Deleting an account removes its ledger and uploads too.
        </p>
      </section>
    </div>
  );
}
