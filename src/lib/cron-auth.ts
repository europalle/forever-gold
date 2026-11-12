// Bearer check for the collector endpoint. Forgiving about copy-paste noise
// (spaces, line breaks, "bearer" in any case, quotes around the value), exact
// about the secret itself, and constant-time in the comparison.

const clean = (s: string) => s.trim().replace(/^["']|["']$/g, "").trim();

export function cronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !clean(secret)) return false;
  const m = header?.match(/^\s*bearer\s+([\s\S]+?)\s*$/i);
  if (!m) return false;
  const a = new TextEncoder().encode(clean(m[1]));
  const b = new TextEncoder().encode(clean(secret));
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
