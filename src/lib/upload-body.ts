import { gunzipSync } from "node:zlib";

// Request bodies for uploads: gzipped when "X-FG-Encoding: gzip" is set, to stay
// far under Vercel's 4.5 MB request limit. SavedVariables files are text.
export const MAX_UNPACKED = 40 * 1024 * 1024;

export class BodyError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function readUploadText(request: Request): Promise<{ text: string; bytes: number }> {
  let body = Buffer.from(await request.arrayBuffer());
  if (request.headers.get("x-fg-encoding") === "gzip") {
    try {
      body = gunzipSync(body, { maxOutputLength: MAX_UNPACKED });
    } catch {
      throw new BodyError("The upload was damaged or too large. Try again.", 400);
    }
  }
  if (body.length === 0) throw new BodyError("The file was empty.", 400);
  if (body.length > MAX_UNPACKED) throw new BodyError("That file is too large.", 413);
  return { text: body.toString("utf8"), bytes: body.length };
}
