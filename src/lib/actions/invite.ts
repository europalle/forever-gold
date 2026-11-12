"use server";

import { redirect } from "next/navigation";
import { db } from "../db";
import { startSession } from "../auth";
import { hashInviteToken, looksLikeToken } from "../invite";
import { MIN_PASSWORD, hashPassword, normalizeUsername } from "../password";
import type { FormState } from "./auth";

class InviteGone extends Error {}

export async function acceptInvite(_prev: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const raw = String(form.get("username") ?? "");
  const password = String(form.get("password") ?? "");
  const again = String(form.get("again") ?? "");
  if (!looksLikeToken(token)) return { error: "This invite link is not valid." };
  const username = normalizeUsername(raw);
  if (!username) return { error: "Usernames are 2 to 24 letters, digits, _ or -." };
  if (password.length < MIN_PASSWORD) return { error: `Use at least ${MIN_PASSWORD} characters for your password.` };
  if (password !== again) return { error: "The passwords do not match." };

  const passwordHash = await hashPassword(password);
  let user;
  try {
    user = await db.$transaction(async (tx) => {
      const invite = await tx.invite.findUnique({ where: { tokenHash: hashInviteToken(token) } });
      if (!invite || invite.usedAt || invite.expiresAt <= new Date()) throw new InviteGone();
      if (await tx.user.findUnique({ where: { username } })) return null;
      const created = await tx.user.create({
        data: { username, displayName: raw.trim(), passwordHash, role: invite.role, lastLoginAt: new Date() },
      });
      // Claim the invite only if nobody else did in the meantime.
      const claimed = await tx.invite.updateMany({
        where: { id: invite.id, usedAt: null },
        data: { usedAt: new Date(), usedById: created.id },
      });
      if (claimed.count !== 1) throw new InviteGone();
      return created;
    });
  } catch (e) {
    if (e instanceof InviteGone) return { error: "This invite has been used or has expired. Ask for a new one." };
    throw e;
  }
  if (!user) return { error: `The name ${raw.trim()} is taken. Pick another.` };
  await startSession(user.id, user.sessionVersion);
  redirect("/");
}
