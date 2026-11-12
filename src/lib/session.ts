// Signed session cookie: user id, the user's session version, an expiry, and
// an HMAC of all three keyed by SESSION_SECRET. Web Crypto only, so the proxy
// can check the signature; the session version is checked against the
// database in requireUser().

export const SESSION_COOKIE = "fg_session";
export const SESSION_DAYS = 30;

const enc = new TextEncoder();

async function key(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

const toHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

function fromHex(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[0-9a-f]+$/.test(hex) || hex.length % 2) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function secret(): string | null {
  const s = process.env.SESSION_SECRET;
  return s && s.length >= 32 ? s : null;
}

export type SessionClaims = { userId: string; version: number };

const payload = (c: SessionClaims, exp: string) => `v2.${c.userId}.${c.version}.${exp}`;

export async function createToken(c: SessionClaims, now = Date.now()): Promise<string> {
  const s = secret();
  if (!s) throw new Error("SESSION_SECRET must be set to at least 32 characters");
  if (!/^[a-z0-9]+$/i.test(c.userId)) throw new Error("bad user id");
  const exp = String(now + SESSION_DAYS * 86_400_000);
  const sig = await crypto.subtle.sign("HMAC", await key(s), enc.encode(payload(c, exp)));
  return `${c.userId}.${c.version}.${exp}.${toHex(sig)}`;
}

export async function verifyToken(token: string | undefined, now = Date.now()): Promise<SessionClaims | null> {
  const s = secret();
  if (!s || !token) return null;
  const [userId, ver, exp, sigHex] = token.split(".");
  const sig = sigHex ? fromHex(sigHex) : null;
  if (!userId || !/^[a-z0-9]+$/i.test(userId) || !/^\d+$/.test(ver ?? "") || !exp || !/^\d+$/.test(exp) || !sig) return null;
  if (Number(exp) < now) return null;
  const claims = { userId, version: Number(ver) };
  const ok = await crypto.subtle.verify("HMAC", await key(s), sig, enc.encode(payload(claims, exp)));
  return ok ? claims : null;
}

// Only for creating the first admin: compares with APP_PASSWORD in constant time.
export async function bootstrapPasswordMatches(given: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
