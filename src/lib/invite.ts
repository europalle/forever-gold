import "server-only";
import { createHash, randomBytes } from "node:crypto";

export const INVITE_DAYS = 7;

// 32 random bytes: unguessable. Only the hash goes in the database.
export function newInviteToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const looksLikeToken = (t: string) => /^[A-Za-z0-9_-]{43}$/.test(t);

export type InviteState = "open" | "used" | "expired";

export function inviteState(i: { usedAt: Date | null; expiresAt: Date }, now = new Date()): InviteState {
  if (i.usedAt) return "used";
  return i.expiresAt <= now ? "expired" : "open";
}
