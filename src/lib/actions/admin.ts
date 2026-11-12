"use server";

import { revalidatePath } from "next/cache";
import { db } from "../db";
import { requireAdmin } from "../auth";
import { MIN_PASSWORD, hashPassword, normalizeUsername } from "../password";
import type { FormState } from "./auth";

export async function createUser(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const raw = String(form.get("username") ?? "");
  const username = normalizeUsername(raw);
  const password = String(form.get("password") ?? "");
  const admin = form.get("admin") === "on";
  if (!username) return { error: "Usernames are 2 to 24 letters, digits, _ or -." };
  if (password.length < MIN_PASSWORD) return { error: `Give them a password of at least ${MIN_PASSWORD} characters.` };
  if (await db.user.findUnique({ where: { username } })) return { error: `${username} already has an account.` };
  await db.user.create({
    data: { username, displayName: raw.trim(), passwordHash: await hashPassword(password), role: admin ? "ADMIN" : "MEMBER" },
  });
  revalidatePath("/admin");
  return { ok: `Account created for ${raw.trim()}. Send them the address and password; they can change it under Account.` };
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
