"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createToken, passwordMatches, SESSION_COOKIE, SESSION_DAYS } from "../session";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const password = String(form.get("password") ?? "");
  if (!process.env.APP_PASSWORD || !process.env.SESSION_SECRET) {
    return { error: "Login is not configured: set APP_PASSWORD and SESSION_SECRET." };
  }
  if (!(await passwordMatches(password))) {
    await new Promise((r) => setTimeout(r, 1000)); // slow down guessing
    return { error: "Wrong password." };
  }
  (await cookies()).set(SESSION_COOKIE, await createToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  redirect("/");
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
