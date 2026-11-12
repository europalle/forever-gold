import { deviceUser } from "@/lib/device";

// The helper checks its pairing code here.
export async function GET(request: Request) {
  const me = await deviceUser(request);
  if (!me) return Response.json({ error: "This pairing code is not valid. Make a new one on your Account page." }, { status: 401 });
  return Response.json({ user: me.displayName });
}
