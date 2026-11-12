import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifyToken } from "./lib/session";

// Send anyone without a valid session to /login. The cron endpoint has its own
// bearer check, and /login must stay reachable.
export async function proxy(request: NextRequest) {
  const ok = await verifyToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!login|api/cron|_next/static|_next/image|favicon.ico|icon).*)"],
};
