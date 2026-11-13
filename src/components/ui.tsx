import Link from "next/link";

// Money as coins: the figure in ink, g s c in the coins' own colours.
export function Money({ c, sign = false, className = "" }: { c: number | null | undefined; sign?: boolean; className?: string }) {
  if (c === null || c === undefined || !Number.isFinite(c)) return <span className={`num text-muted ${className}`}>-</span>;
  const neg = c < 0;
  const n = Math.round(Math.abs(c));
  const g = Math.floor(n / 10_000);
  const s = Math.floor((n % 10_000) / 100);
  const cu = n % 100;
  const pad = (v: number) => String(v).padStart(2, "0");
  return (
    <span className={`num ${className}`}>
      {neg ? "-" : sign ? "+" : ""}
      {g > 0 ? (
        <>
          {g.toLocaleString("en-US")}
          <span className="coin-g">g</span>
        </>
      ) : null}
      {g > 0 || s > 0 ? (
        <>
          {g > 0 ? pad(s) : s}
          <span className="coin-s">s</span>
        </>
      ) : null}
      {g > 0 || s > 0 ? pad(cu) : cu}
      <span className="coin-c">c</span>
    </span>
  );
}

// The title row of a screen: its name, and the one thing worth knowing now.
export function PageTitle({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rise flex flex-wrap items-end justify-between gap-x-8 gap-y-3 pb-5 pt-7">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold">{title}</h1>
        {children ? <p className="mt-1 max-w-[70ch] text-base text-muted">{children}</p> : null}
      </div>
      {action}
    </div>
  );
}

// Tabs: the active one carries the 1px gold line on the row's rule.
export function Tabs({ items, className = "" }: { items: { href: string; label: React.ReactNode; on: boolean }[]; className?: string }) {
  return (
    <nav className={`tabs ${className}`}>
      {items.map((t, i) => (
        <Link key={i} href={t.href} className="tab" aria-current={t.on ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function Card({ title, note, action, children, className = "" }: { title?: React.ReactNode; note?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {title ? (
        <div className="card-head">
          <div className="min-w-0">
            <h2 className="card-title">{title}</h2>
            {note ? <p className="mt-0.5 text-sm text-muted">{note}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 pb-4 pt-1 text-sm text-muted">{children}</p>;
}

const ACTION_TAG: Record<string, string> = { buy: "tag-buy", sell: "tag-sell", hold: "tag-hold", wait: "tag-wait" };
const ACTION_WORD: Record<string, string> = { buy: "Buy", sell: "Sell", hold: "Hold", wait: "Wait" };
export function ActionTag({ action, strength }: { action: string; strength: number }) {
  if (!ACTION_WORD[action]) return null;
  return <span className={`tag ${ACTION_TAG[action]}`}>{strength === 2 ? `Strong ${ACTION_WORD[action].toLowerCase()}` : ACTION_WORD[action]}</span>;
}

export function Pct({ v, digits = 0, color = true }: { v: number | null | undefined; digits?: number; color?: boolean }) {
  if (v === null || v === undefined || !Number.isFinite(v)) return <span className="num text-muted">-</span>;
  const p = v * 100;
  const text = `${p > 0 ? "+" : ""}${p.toFixed(digits)}%`;
  const cls = !color || Math.abs(p) < 2 ? "text-muted" : p > 0 ? "text-good" : "text-bad";
  return <span className={`num ${cls}`}>{text}</span>;
}

// Method notes stay one click away: the data sits right under the title.
export function How({ label = "How this works", children }: { label?: string; children: React.ReactNode }) {
  return (
    <details className="how group">
      <summary className="btn btn-small cursor-pointer list-none">{label}</summary>
      <div className="how-body card mt-2 max-w-[80ch] p-4 text-sm text-muted">{children}</div>
    </details>
  );
}

// Item quality as the game colours it: a 2px bar before the name.
const QUALITY = ["#8f9198", "#e8e8ea", "#1eff00", "#3a8dff", "#b048f8", "#ff8000"];
export function ItemName({ id, name, quality, className = "" }: { id: number; name: string; quality?: number | null; className?: string }) {
  return (
    <Link href={`/item/${id}`} className={`item-name inline-flex items-center gap-2 font-medium hover:underline ${className}`}>
      <span aria-hidden="true" className="h-4 w-0.5 shrink-0 rounded-sm" style={{ background: quality != null ? (QUALITY[quality] ?? QUALITY[1]) : "#3a3a3e" }} />
      <span className="truncate">{name}</span>
    </Link>
  );
}

// A week of the cheapest price, drawn to its own range with a little headroom
// so a small move does not look like a cliff. The last point carries the hue.
export function Sparkline({ values, width = 96, height = 24 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <span className="num text-muted">-</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mid = (min + max) / 2;
  const span = Math.max(max - min, mid * 0.2) * 1.15; // at least a fifth of the level
  const lo = mid - span / 2;
  const x = (i: number) => 1 + (i / (values.length - 1)) * (width - 6);
  const y = (v: number) => height - 2 - ((v - lo) / span) * (height - 4);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  const change = values[values.length - 1] / values[0] - 1;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Seven days: ${change >= 0 ? "up" : "down"} ${Math.abs(Math.round(change * 100))}%`} className="inline-block align-middle">
      <path d={d} fill="none" stroke="#8f9198" strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="2" fill="#d8b25a" />
    </svg>
  );
}

// A share drawn as a short bar under its figure (sale rate, drop chance).
export function Meter({ share, width = 56, label }: { share: number | null | undefined; width?: number; label?: string }) {
  if (share === null || share === undefined || !Number.isFinite(share)) return <span className="num text-muted">-</span>;
  const s = Math.max(0, Math.min(1, share));
  return (
    <span className="inline-flex flex-col items-end gap-1 align-top" title={label}>
      <span className="num">{Math.round(s * 100)}%</span>
      <span className="block h-0.5 rounded-sm bg-raised" style={{ width }}>
        <span className="block h-0.5 rounded-sm bg-[#c4c4c8]" style={{ width: `${s * 100}%` }} />
      </span>
    </span>
  );
}

// A figure with its label: type, not a tile.
export function Stat({ label, children, note }: { label: string; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-xl">{children}</dd>
      {note ? <div className="mt-0.5 text-xs text-muted">{note}</div> : null}
    </div>
  );
}

// A settings section: what it is on the left, its panel on the right.
export function SettingRow({ title, note, children }: { title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-x-10 gap-y-3 border-t border-line py-8 first:border-t-0 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]">
      <div>
        <h2 className="text-lg font-medium">{title}</h2>
        {note ? <div className="mt-1 max-w-[46ch] text-muted">{note}</div> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
