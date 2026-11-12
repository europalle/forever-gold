"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "../db";
import { requireUser, startSession } from "../auth";
import { MIN_PASSWORD, hashPassword, normalizeUsername, verifyPassword } from "../password";
import { SESSION_COOKIE, bootstrapPasswordMatches } from "../session";

export type FormState = { error?: string; ok?: string };

const slow = () => new Promise((r) => setTimeout(r, 1000)); // slows down guessing

export async function login(_prev: FormState, form: FormData): Promise<FormState> {
  if (!process.env.SESSION_SECRET) return { error: "Login is not configured: set SESSION_SECRET." };
  const rawName = String(form.get("username") ?? "");
  const password = String(form.get("password") ?? "");
  const username = normalizeUsername(rawName);
  if (!username || !password) {
    await slow();
    return { error: "Wrong username or password." };
  }

  let user = await db.user.findUnique({ where: { username } });

  // First run: no accounts yet. APP_PASSWORD creates the admin account, with
  // whatever username was typed. After that, APP_PASSWORD does nothing.
  if (!user && (await db.user.count()) === 0) {
    if (!(await bootstrapPasswordMatches(password))) {
      await slow();
      return { error: "No accounts yet. Sign in with the APP_PASSWORD from Vercel to create the admin account." };
    }
    user = await db.user.create({
      data: { username, displayName: rawName.trim(), passwordHash: await hashPassword(password), role: "ADMIN" },
    });
  } else if (!user || !(await verifyPassword(password, user.passwordHash))) {
    await slow();
    return { error: "Wrong username or password." };
  }

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await startSession(user.id, user.sessionVersion);
  redirect("/");
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

export async function changePassword(_prev: FormState, form: FormData): Promise<FormState> {
  const me = await requireUser();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  const again = String(form.get("again") ?? "");
  if (next.length < MIN_PASSWORD) return { error: `Use at least ${MIN_PASSWORD} characters.` };
  if (next !== again) return { error: "The new passwords do not match." };
  const user = await db.user.findUniqueOrThrow({ where: { id: me.id } });
  if (!(await verifyPassword(current, user.passwordHash))) {
    await slow();
    return { error: "Your current password is wrong." };
  }
  const updated = await db.user.update({
    where: { id: me.id },
    data: { passwordHash: await hashPassword(next), sessionVersion: { increment: 1 } },
  });
  await startSession(updated.id, updated.sessionVersion);
  return { ok: "Password changed. Other devices are signed out." };
}

export async function changeUsername(_prev: FormState, form: FormData): Promise<FormState> {
  const me = await requireUser();
  const raw = String(form.get("username") ?? "");
  const username = normalizeUsername(raw);
  if (!username) return { error: "Usernames are 2 to 24 letters, digits, _ or -." };
  const taken = await db.user.findUnique({ where: { username }, select: { id: true } });
  if (taken && taken.id !== me.id) return { error: `${raw.trim()} is taken.` };
  await db.user.update({ where: { id: me.id }, data: { username, displayName: raw.trim() } });
  revalidatePath("/", "layout");
  return { ok: `You are now ${raw.trim()}. Sign in with that name from now on; your password stays the same.` };
}
