import { createHash } from "node:crypto";
import { buildAddonData } from "@/lib/addon-data";
import { deviceUser } from "@/lib/device";

// The helper fetches the addon's data file here every few minutes. An ETag over
// everything but the timestamp lets it skip rewriting an unchanged file.
export const maxDuration = 60;

export async function GET(request: Request) {
  const me = await deviceUser(request);
  if (!me) return Response.json({ error: "This pairing code is not valid. Make a new one on your Account page." }, { status: 401 });
  const lua = await buildAddonData(me.userId, me.displayName);
  const etag = `"${createHash("sha256").update(lua.replace(/generatedAt=\d+/, "")).digest("hex").slice(0, 32)}"`;
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
  return new Response(lua, { headers: { "Content-Type": "text/plain; charset=utf-8", ETag: etag, "Cache-Control": "no-store" } });
}
