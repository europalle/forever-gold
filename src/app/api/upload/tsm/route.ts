import { importAddon, NotAddonFile } from "@/lib/addon-import";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { LuaParseError } from "@/lib/lua-table";
import { NotTsmFile } from "@/lib/tsm-accounting";
import { importTsm } from "@/lib/tsm-import";
import { BodyError, readUploadText } from "@/lib/upload-body";

// The Ledger page's upload, gzipped by the browser: TradeSkillMaster.lua or the
// addon's ForeverGold.lua, told apart by the global inside.
export const maxDuration = 60;

export async function POST(request: Request) {
  const me = await currentUser();
  if (!me) return Response.json({ error: "Sign in first." }, { status: 401 });
  try {
    const { text, bytes } = await readUploadText(request);
    if (/^\s*ForeverGoldDB\s*=/m.test(text)) return Response.json({ kind: "addon", ...(await importAddon(db, me.id, text, bytes)) });
    return Response.json({ kind: "tsm", ...(await importTsm(db, me.id, text, bytes)) });
  } catch (e) {
    if (e instanceof BodyError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof NotTsmFile || e instanceof NotAddonFile || e instanceof LuaParseError) {
      return Response.json({ error: `That does not look like TradeSkillMaster.lua or ForeverGold.lua: ${e.message}` }, { status: 400 });
    }
    throw e;
  }
}
