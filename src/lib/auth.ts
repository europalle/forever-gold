import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { SESSION_COOKIE, SESSION_DAYS, createToken, verifyToken } from "./session";

export type CurrentUser = { id: string; username: string; displayName: string; role: "ADMIN" | "MEMBER" };

// The signed-in user, or null. The proxy only checks the signature; this also
// checks the user still exists and the session has not been revoked.
export async function currentUser(): Promise<CurrentUser | null> {
  const claims = await verifyToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  const user = await db.user.findUnique({
    where: { id: claims.userId },
    select: { id: true, username: true, displayName: true, role: true, sessionVersion: true },
  });
  if (!user || user.sessionVersion !== claims.version) return null;
  return { id: user.id, username: user.username, displayName: user.displayName, role: user.role };
}

export async function requireUser(): Promise<CurrentUser> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const u = await requireUser();
  if (u.role !== "ADMIN") redirect("/");
  return u;
}

export async function startSession(userId: string, version: number) {
  (await cookies()).set(SESSION_COOKIE, await createToken({ userId, version }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}
