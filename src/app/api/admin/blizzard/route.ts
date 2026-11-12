import { currentUser } from "@/lib/auth";
import { chooseHouse, discoverHouse } from "@/lib/blizzard-collect";
import { db } from "@/lib/db";

// Admin only: find our auction house among Blizzard's (several large
// downloads), or set it by hand.
export const maxDuration = 300;

export async function POST(request: Request) {
  const me = await currentUser();
  if (!me || me.role !== "ADMIN") return Response.json({ error: "Admins only." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { action?: string; rulesetId?: number; houseId?: number; houseName?: string; buyoutPerUnit?: boolean };
  try {
    if (body.action === "choose" && body.rulesetId && body.houseId) {
      await chooseHouse(db, body.rulesetId, body.houseId, String(body.houseName ?? body.houseId), body.buyoutPerUnit === true);
      return Response.json({ ok: true });
    }
    return Response.json(await discoverHouse(db));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
