"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "../db";
import { requireAdmin } from "../auth";
import { INVITE_DAYS, newInviteToken } from "../invite";
import { MIN_PASSWORD, hashPassword } from "../password";
import type { FormState } from "./auth";

export type InviteFormState = FormState & { link?: string };

// The site's own address, as the browser reached it.
async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function createInvite(_prev: InviteFormState, form: FormData): Promise<InviteFormState> {
  const me = await requireAdmin();
  const note = String(form.get("note") ?? "").trim().slice(0, 60);
  const admin = form.get("admin") === "on";
  const { token, hash } = newInviteToken();
  await db.invite.create({
    data: {
      tokenHash: hash,
      note,
      role: admin ? "ADMIN" : "MEMBER",
      createdById: me.id,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
    },
  });
  revalidatePath("/admin");
  return {
    ok: `Invite created${note ? ` for ${note}` : ""}. It works once and expires in ${INVITE_DAYS} days. Copy it now: it is not shown again.`,
    link: `${await origin()}/invite/${token}`,
  };
}

export async function revokeInvite(form: FormData): Promise<void> {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  await db.invite.deleteMany({ where: { id, usedAt: null } });
  revalidatePath("/admin");
}

export async function resetPassword(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  const password = String(form.get("password") ?? "");
  if (password.length < MIN_PASSWORD) return { error: `Use at least ${MIN_PASSWORD} characters.` };
  await db.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(password), sessionVersion: { increment: 1 } },
  });
  revalidatePath("/admin");
  return { ok: "Password reset. They are signed out everywhere." };
}

export async function deleteUser(form: FormData): Promise<void> {
  const me = await requireAdmin();
  const id = String(form.get("id") ?? "");
  if (id === me.id) return; // never yourself
  await db.user.delete({ where: { id } });
  revalidatePath("/admin");
}
