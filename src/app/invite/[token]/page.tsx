import { connection } from "next/server";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { hashInviteToken, inviteState, looksLikeToken } from "@/lib/invite";
import { InviteForm } from "./form";

export const metadata = { title: "Join · Forever Gold", robots: { index: false, follow: false } };

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="text-2xl font-bold">Forever Gold</h1>
      <Suspense fallback={<p className="mt-2 text-sm text-muted">Checking your invite…</p>}>
        <Invite params={params} />
      </Suspense>
    </main>
  );
}

async function Invite({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const invite = looksLikeToken(token)
    ? await db.invite.findUnique({ where: { tokenHash: hashInviteToken(token) }, select: { usedAt: true, expiresAt: true } })
    : null;
  const state = invite ? inviteState(invite) : null;
  if (state !== "open") {
    return (
      <p className="mt-2 text-sm text-muted">
        {state === "used"
          ? "This invite has already been used."
          : state === "expired"
            ? "This invite has expired."
            : "This invite link is not valid."}{" "}
        Ask for a new one. Already have an account? <a href="/login" className="text-text underline">Sign in</a>.
      </p>
    );
  }
  return (
    <>
      <p className="mt-1 text-sm text-muted">You are invited. Pick a username and password; the link works once.</p>
      <InviteForm token={token} />
    </>
  );
}
