import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// scrypt from Node's crypto: no dependency. Stored as
// scrypt$N$r$p$salt$hash (base64url), so the cost can rise later.
const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const N = 2 ** 15;
const R = 8;
const P = 1;
const LEN = 32;

export const MIN_PASSWORD = 10;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, LEN, { N, r: R, p: P, maxmem: 128 * N * R * 2 });
  return ["scrypt", N, R, P, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, saltB64, hashB64] = stored.split("$");
  if (alg !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64url");
  const got = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64url"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 128 * Number(n) * Number(r) * 2,
  });
  return got.length === expected.length && timingSafeEqual(got, expected);
}

// Usernames: letters (any alphabet, so WoW names work), digits, _ and -.
export function normalizeUsername(raw: string): string | null {
  const u = raw.trim().toLocaleLowerCase("en");
  return /^[\p{L}\p{N}_-]{2,24}$/u.test(u) ? u : null;
}
