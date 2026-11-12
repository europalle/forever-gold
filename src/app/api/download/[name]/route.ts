import { readFile } from "node:fs/promises";
import path from "node:path";
import { currentUser } from "@/lib/auth";

// Members-only downloads, built by scripts/build-downloads.sh into downloads/.
const FILES: Record<string, string> = {
  "ForeverGold-addon.zip": "application/zip",
  "ForeverGoldHelper.exe": "application/vnd.microsoft.portable-executable",
};

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  if (!(await currentUser())) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { name } = await params;
  const type = FILES[name];
  if (!type) return Response.json({ error: "No such download." }, { status: 404 });
  const body = await readFile(path.join(process.cwd(), "downloads", name));
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
