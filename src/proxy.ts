import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifyToken } from "./lib/session";

// Send anyone without a validly signed session to /login, and tell search
// engines to keep out everywhere. /api/sync is for the helper program, which
// authenticates with its own pairing code (src/lib/device.ts). requireUser() does the full check (account
// still exists, session not revoked). The cron endpoint has its own bearer
// check; /login, /invite/<token> and robots.txt must stay reachable.
export async function proxy(request: NextRequest) {
  const claims = await verifyToken(request.cookies.get(SESSION_COOKIE)?.value);
  // API callers (the upload, later the helper program) get a plain 401, not a
  // redirect to a login page they cannot use.
  const res = claims
    ? NextResponse.next()
    : request.nextUrl.pathname.startsWith("/api/")
      ? NextResponse.json({ error: "Sign in first." }, { status: 401 })
      : NextResponse.redirect(new URL("/login", request.url));
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export const config = {
  matcher: ["/((?!login|invite/|robots.txt|api/cron|api/sync|_next/static|_next/image|favicon.ico|icon|apple-icon).*)"],
};
