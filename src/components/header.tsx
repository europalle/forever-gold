import Link from "next/link";
import { Suspense } from "react";
import { MARKET } from "@/config/player";
import { logout } from "@/lib/actions/auth";
import { currentUser } from "@/lib/auth";
import { connection } from "next/server";

const market = `${MARKET.region.toUpperCase()} · PvP · ${MARKET.faction[0].toUpperCase()}${MARKET.faction.slice(1)}`;

export function Header({ active }: { active: "board" | "market" | "research" | "ledger" | "account" | "admin" | "item" }) {
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-line pb-4">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <Link href="/" className="text-2xl font-semibold text-gold">
          Forever Gold
        </Link>
        <nav className="flex gap-4 text-sm">
          <NavLink href="/" on={active === "board"}>Board</NavLink>
          <NavLink href="/market" on={active === "market"}>Market</NavLink>
          <NavLink href="/research" on={active === "research"}>Research</NavLink>
          <NavLink href="/ledger" on={active === "ledger"}>Ledger</NavLink>
          <NavLink href="/account" on={active === "account"}>Account</NavLink>
          <Suspense fallback={null}>
            <AdminLink on={active === "admin"} />
          </Suspense>
        </nav>
      </div>
      <div className="flex items-baseline gap-3 text-sm text-muted">
        <span>{market}</span>
        <Suspense fallback={null}>
          <Who />
        </Suspense>
        <form action={logout}>
          <button type="submit" className="hover:text-text hover:underline">Sign out</button>
        </form>
      </div>
    </header>
  );
}

function NavLink({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={on ? "text-text underline underline-offset-4" : "text-muted hover:text-text"}>
      {children}
    </Link>
  );
}

async function AdminLink({ on }: { on: boolean }) {
  await connection();
  const u = await currentUser();
  return u?.role === "ADMIN" ? <NavLink href="/admin" on={on}>Admin</NavLink> : null;
}

async function Who() {
  await connection();
  const u = await currentUser();
  return u ? <span className="text-text">{u.displayName}</span> : null;
}
