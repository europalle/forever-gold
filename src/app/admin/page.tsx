import { connection } from "next/server";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { blizzardConfigured } from "@/lib/blizzard";
import { getHouseChoice } from "@/lib/blizzard-collect";
import { BlizzardDiscovery } from "./blizzard";
import { DeleteButton } from "./delete-button";
import { revokeInvite } from "@/lib/actions/admin";
import { inviteState } from "@/lib/invite";
import { InviteForm, ResetForm } from "./forms";

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

// Open invites, and used or expired ones from the last 30 days.
function recentInvites() {
  return db.invite.findMany({
    where: { OR: [{ usedAt: null }, { usedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }] },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, note: true, role: true, createdAt: true, expiresAt: true, usedAt: true, usedBy: { select: { displayName: true } } },
  });
}

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "never");

async function Admin() {
  await connection();
  const me = await requireAdmin();
  const invites = await recentInvites();
  const [house, lastDepth] = await Promise.all([
    getHouseChoice(db),
    db.depthSnapshot.findFirst({ orderBy: { lastModified: "desc" }, select: { lastModified: true, itemCount: true, auctionCount: true, fetchedAt: true } }),
  ]);
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
                  <DeleteButton id={u.id} name={u.displayName} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Blizzard auction data</h2>
        <div className="mb-3 max-w-prose space-y-1 text-sm text-muted">
          {!blizzardConfigured() ? (
            <p className="text-warn">BNET_CLIENT_ID and BNET_CLIENT_SECRET are not set on this deployment.</p>
          ) : house ? (
            <p>
              Collecting from <span className="text-text">{house.houseName}</span> (house {house.houseId}, ruleset {house.rulesetId}), item auction
              prices read {house.buyoutPerUnit ? "per unit" : "per stack"}.{" "}
              {lastDepth
                ? `Latest listing: ${day(lastDepth.lastModified)}, ${lastDepth.itemCount.toLocaleString("en-US")} items from ${lastDepth.auctionCount.toLocaleString("en-US")} auctions.`
                : "No listing stored yet: the next hourly collection fetches one."}
            </p>
          ) : (
            <p>The key is set. Find our auction house once; after that the hourly collection stores how many are listed at each price.</p>
          )}
        </div>
        {blizzardConfigured() ? <BlizzardDiscovery /> : null}
      </section>
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Invite a guildie</h2>
        <InviteForm />
        <p className="mt-3 max-w-prose text-sm text-muted">
          Send the link in a private message. Whoever opens it first picks a username and password; then the link is spent.
          There is no other way to sign up. Deleting an account removes its ledger and uploads too.
        </p>
      </section>
      {invites.length ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Invites</h2>
          <ul className="divide-y divide-line rounded border border-line text-sm">
            {invites.map((i) => {
              const st = inviteState(i);
              return (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <span>
                    <span className="font-medium">{i.note || "Invite"}</span>{" "}
                    <span className="text-muted">
                      {i.role === "ADMIN" ? "admin · " : ""}made {day(i.createdAt)} ·{" "}
                      {st === "used"
                        ? `used by ${i.usedBy?.displayName ?? "a deleted account"} ${day(i.usedAt)}`
                        : st === "expired"
                          ? `expired ${day(i.expiresAt)}`
                          : `open until ${day(i.expiresAt)}`}
                    </span>
                  </span>
                  {st === "open" ? (
                    <form action={revokeInvite}>
                      <input type="hidden" name="id" value={i.id} />
                      <button type="submit" className="rounded border border-line px-2 py-1 text-xs text-muted hover:text-text">
                        Cancel invite
                      </button>
                    </form>
                  ) : (
                    <span className={`text-xs ${st === "used" ? "text-good" : "text-muted"}`}>{st}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
