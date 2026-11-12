import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifyToken } from "./session";

// Call at the top of anything that reads private data. The proxy redirects
// early; this is the check that counts.
export async function requireSession(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!(await verifyToken(token))) redirect("/login");
}
