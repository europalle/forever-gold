import { importAddon, NotAddonFile } from "@/lib/addon-import";
import { db } from "@/lib/db";
import { deviceUser } from "@/lib/device";
import { LuaParseError } from "@/lib/lua-table";
import { NotTsmFile } from "@/lib/tsm-accounting";
import { importTsm } from "@/lib/tsm-import";
import { BodyError, readUploadText } from "@/lib/upload-body";

// The helper uploads a SavedVariables file: ?file=tsm for TradeSkillMaster.lua,
// ?file=addon for ForeverGold.lua.
export const maxDuration = 60;

export async function POST(request: Request) {
  const me = await deviceUser(request);
  if (!me) return Response.json({ error: "This pairing code is not valid. Make a new one on your Account page." }, { status: 401 });
  const file = new URL(request.url).searchParams.get("file");
  try {
    const { text, bytes } = await readUploadText(request);
    if (file === "tsm") return Response.json(await importTsm(db, me.userId, text, bytes));
    if (file === "addon") return Response.json(await importAddon(db, me.userId, text, bytes));
    return Response.json({ error: `Unknown file kind: ${file}` }, { status: 400 });
  } catch (e) {
    if (e instanceof BodyError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof NotTsmFile || e instanceof NotAddonFile || e instanceof LuaParseError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
