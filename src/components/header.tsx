import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { MARKET } from "@/config/player";
import { logout } from "@/lib/actions/auth";
import { currentUser } from "@/lib/auth";
import { freshness } from "@/lib/queries/status";

const market = `${MARKET.region.toUpperCase()} · PvP · ${MARKET.faction[0].toUpperCase()}${MARKET.faction.slice(1)}`;

type Active = "board" | "market" | "signals" | "research" | "ledger" | "account" | "admin" | "item";
const NAV: [Active, string, string][] = [
  ["board", "/", "Board"],
  ["signals", "/signals", "Signals"],
  ["market", "/market", "Market"],
  ["research", "/research", "Research"],
  ["ledger", "/ledger", "Ledger"],
  ["account", "/account", "Account"],
];

// The shell: one bar with the mark, the sections and how fresh the data is.
// The active section carries the 1px gold line on the bar's rule.
export function Header({ active }: { active: Active }) {
  return (
    <header className="border-b border-line">
      <div className="flex flex-wrap items-center gap-x-8">
        <Link href="/" className="flex h-12 items-center gap-2.5" aria-label="Forever Gold, home">
          <Mark />
          <span className="text-lg font-semibold">Forever Gold</span>
        </Link>
        <nav className="order-last -mb-px flex w-full gap-x-6 overflow-x-auto md:order-none md:w-auto md:flex-1" aria-label="Sections">
          {NAV.map(([key, href, label]) => (
            <Link key={key} href={href} className="tab h-10 md:h-12" aria-current={active === key || (key === "market" && active === "item") ? "page" : undefined}>
              {label}
            </Link>
          ))}
          <Suspense fallback={null}>
            <AdminLink on={active === "admin"} />
          </Suspense>
        </nav>
        <div className="ml-auto flex h-12 items-center gap-4 text-sm text-muted">
          <span className="hidden lg:inline">{market}</span>
          <Suspense fallback={null}>
            <Who />
          </Suspense>
          <form action={logout}>
            <button type="submit" className="hover:text-text">Sign out</button>
          </form>
        </div>
      </div>
      <Suspense fallback={<div className="h-8 border-t border-rule" />}>
        <FreshnessLine />
      </Suspense>
    </header>
  );
}

// The coin from the app's icon: a ring and a G, in the one accent.
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true">
      <circle cx="11" cy="11" r="10" fill="#d8b25a" />
      <circle cx="11" cy="11" r="7.2" fill="none" stroke="#131217" strokeOpacity="0.35" strokeWidth="1" />
      <path d="M14.6 8.6A4.3 4.3 0 1 0 15.3 11H11.4" fill="none" stroke="#131217" strokeWidth="2" strokeLinecap="square" />
    </svg>
  );
}

async function AdminLink({ on }: { on: boolean }) {
  await connection();
  const u = await currentUser();
  return u?.role === "ADMIN" ? (
    <Link href="/admin" className="tab h-10 md:h-12" aria-current={on ? "page" : undefined}>
      Admin
    </Link>
  ) : null;
}

async function Who() {
  await connection();
  const u = await currentUser();
  return u ? <span className="text-text">{u.displayName}</span> : null;
}

async function FreshnessLine() {
  await connection();
  const u = await currentUser();
  const feeds = await freshness(u?.id ?? null);
  return (
    <dl className="flex min-h-8 flex-wrap items-center gap-x-5 border-t border-rule py-1.5 text-xs text-muted" aria-label="How fresh the data is">
      {feeds.map((f) => (
        <div key={f.label} className="flex items-center gap-1.5" title={`${f.hint}${f.at ? `. Last: ${f.at.toISOString().slice(0, 16).replace("T", " ")} UTC` : ""}`}>
          <dt>{f.label}</dt>
          <dd className={`num ${f.stale ? "text-warn" : "text-text"}`}>{f.text}</dd>
        </div>
      ))}
    </dl>
  );
}
