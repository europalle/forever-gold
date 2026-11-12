import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";

// Pairing codes for the helper program: "fg_" + 32 random bytes. Shown once;
// only the SHA-256 is stored.
export function newDeviceToken(): { token: string; hash: string } {
  const token = `fg_${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashDeviceToken(token) };
}

export const hashDeviceToken = (t: string) => createHash("sha256").update(t.trim()).digest("hex");

export type DeviceUser = { userId: string; deviceId: string; displayName: string };

// The user behind a request's "Authorization: Bearer fg_..." header, or null.
export async function deviceUser(request: Request): Promise<DeviceUser | null> {
  const m = /^\s*bearer\s+(fg_[A-Za-z0-9_-]{43})\s*$/i.exec(request.headers.get("authorization") ?? "");
  if (!m) return null;
  const device = await db.device.findUnique({
    where: { tokenHash: hashDeviceToken(m[1]) },
    select: { id: true, userId: true, user: { select: { displayName: true } } },
  });
  if (!device) return null;
  await db.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
  return { userId: device.userId, deviceId: device.id, displayName: device.user.displayName };
}
