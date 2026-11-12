// Copper to "12g 34s 56c". Leading zero units are dropped; inner ones are
// padded so columns line up ("1g 02s 00c").
export function formatCopper(c: number | null | undefined): string {
  if (c === null || c === undefined || !Number.isFinite(c)) return "-";
  const sign = c < 0 ? "-" : "";
  const n = Math.round(Math.abs(c));
  const g = Math.floor(n / 10_000);
  const s = Math.floor((n % 10_000) / 100);
  const cu = n % 100;
  const pad = (v: number) => String(v).padStart(2, "0");
  if (g > 0) return `${sign}${g.toLocaleString("en-US")}g ${pad(s)}s ${pad(cu)}c`;
  if (s > 0) return `${sign}${s}s ${pad(cu)}c`;
  return `${sign}${cu}c`;
}

export function formatPercent(share: number | null | undefined, digits = 0): string {
  if (share === null || share === undefined || !Number.isFinite(share)) return "-";
  return `${(share * 100).toFixed(digits)}%`;
}
