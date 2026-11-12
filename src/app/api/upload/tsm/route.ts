import { gunzipSync } from "node:zlib";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { LuaParseError } from "@/lib/lua-table";
import { NotTsmFile } from "@/lib/tsm-accounting";
import { importTsm } from "@/lib/tsm-import";

// POST the contents of TradeSkillMaster.lua, gzipped by the browser (header
// X-FG-Encoding: gzip) to stay far under Vercel's 4.5 MB request limit.
export const maxDuration = 60;

const MAX_UNPACKED = 40 * 1024 * 1024;

export async function POST(request: Request) {
  const me = await currentUser();
  if (!me) return Response.json({ error: "Sign in first." }, { status: 401 });

  let body = Buffer.from(await request.arrayBuffer());
  if (request.headers.get("x-fg-encoding") === "gzip") {
    try {
      body = gunzipSync(body, { maxOutputLength: MAX_UNPACKED });
    } catch {
      return Response.json({ error: "The upload was damaged or too large. Try again." }, { status: 400 });
    }
  }
  if (body.length === 0) return Response.json({ error: "The file was empty." }, { status: 400 });
  if (body.length > MAX_UNPACKED) return Response.json({ error: "That file is too large to be TSM's." }, { status: 413 });

  try {
    const result = await importTsm(db, me.id, body.toString("utf8"), body.length);
    return Response.json(result);
  } catch (e) {
    if (e instanceof NotTsmFile || e instanceof LuaParseError) {
      return Response.json({ error: `That does not look like TradeSkillMaster.lua: ${e.message}` }, { status: 400 });
    }
    throw e;
  }
}
