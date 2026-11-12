// One password, one signed cookie. The cookie holds an expiry and an HMAC of it,
// keyed by SESSION_SECRET. Web Crypto only, so it runs in the proxy too.

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

export async function createToken(now = Date.now()): Promise<string> {
  const s = secret();
  if (!s) throw new Error("SESSION_SECRET must be set to at least 32 characters");
  const exp = String(now + SESSION_DAYS * 86_400_000);
  const sig = await crypto.subtle.sign("HMAC", await key(s), enc.encode(`v1.${exp}`));
  return `${exp}.${toHex(sig)}`;
}

export async function verifyToken(token: string | undefined, now = Date.now()): Promise<boolean> {
  const s = secret();
  if (!s || !token) return false;
  const [exp, sigHex] = token.split(".");
  const sig = sigHex ? fromHex(sigHex) : null;
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < now) return false;
  return crypto.subtle.verify("HMAC", await key(s), sig, enc.encode(`v1.${exp}`));
}

// Constant-time password check: compare digests, not the strings.
export async function passwordMatches(given: string): Promise<boolean> {
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
