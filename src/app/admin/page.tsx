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
import { PageTitle, SettingRow } from "@/components/ui";

export const metadata = { title: "Admin · Forever Gold" };

export default function AdminPage() {
  return (
    <main className="mx-auto max-w-[1360px] px-4 pb-16 sm:px-8">
      <Header active="admin" />
      <Suspense fallback={<div className="pt-7" aria-busy="true"><div className="skeleton h-8 w-40" /><div className="skeleton mt-6 h-96" /></div>}>
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
  const open = invites.filter((i) => inviteState(i) === "open").length;
  return (
    <>
      <PageTitle title="Admin">
        {users.length} {users.length === 1 ? "account" : "accounts"}, {open} open {open === 1 ? "invite" : "invites"}.{" "}
        {house ? `Listings from ${house.houseName}.` : "No auction house chosen yet."}
      </PageTitle>
      <div className="border-t border-line">
        <SettingRow title="Guild accounts" note="Deleting an account removes its ledger and uploads.">
          <div className="card overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Last sign-in</th>
                  <th>Last upload</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <span className="font-medium">{u.displayName}</span>
                      {u.username !== u.displayName.toLowerCase() ? <span className="text-muted"> {u.username}</span> : null}
                    </td>
                    <td className="text-muted">{u.role === "ADMIN" ? "Admin" : "Member"}</td>
                    <td className="num text-muted">{day(u.lastLoginAt)}</td>
                    <td className="num text-muted">{day(u.uploads[0]?.at)}</td>
                    <td className="r">
                      {u.id === me.id ? (
                        <span className="text-xs text-muted">you</span>
                      ) : (
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <ResetForm id={u.id} />
                          <DeleteButton id={u.id} name={u.displayName} />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SettingRow>

        <SettingRow title="Invites" note="One-time links, good for 7 days. The only way to sign up.">
          <div className="card p-4">
            <InviteForm />
          </div>
          {invites.length ? (
            <div className="card mt-4 overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>For</th>
                    <th>Made</th>
                    <th>State</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {invites.map((i) => {
                    const st = inviteState(i);
                    return (
                      <tr key={i.id}>
                        <td>
                          <span className="font-medium">{i.note || "Invite"}</span>
                          {i.role === "ADMIN" ? <span className="text-muted"> admin</span> : null}
                        </td>
                        <td className="num text-muted">{day(i.createdAt)}</td>
                        <td className="text-muted">
                          {st === "used" ? (
                            <>Used by <span className="text-text">{i.usedBy?.displayName ?? "a deleted account"}</span></>
                          ) : st === "expired" ? (
                            "Expired"
                          ) : (
                            <>Open until <span className="num">{day(i.expiresAt)}</span></>
                          )}
                        </td>
                        <td className="r">
                          {st === "open" ? (
                            <form action={revokeInvite}>
                              <input type="hidden" name="id" value={i.id} />
                              <button type="submit" className="btn btn-small">Cancel</button>
                            </form>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </SettingRow>

        <SettingRow
          title="Blizzard listings"
          note={
            !blizzardConfigured() ? (
              <span className="text-warn">BNET_CLIENT_ID and BNET_CLIENT_SECRET are not set on this deployment.</span>
            ) : house ? (
              <>
                House {house.houseId}, ruleset {house.rulesetId}, buyouts {house.buyoutPerUnit ? "per unit" : "per stack"}.{" "}
                {lastDepth ? `Latest ${day(lastDepth.lastModified)}: ${lastDepth.itemCount.toLocaleString("en-US")} items, ${lastDepth.auctionCount.toLocaleString("en-US")} auctions.` : "No listing stored yet."}
              </>
            ) : (
              "Find the auction house once; hourly collection follows."
            )
          }
        >
          {blizzardConfigured() ? <div className="card p-4"><BlizzardDiscovery /></div> : <p className="text-muted">Set the two variables on Vercel, then redeploy.</p>}
        </SettingRow>
      </div>
    </>
  );
}
