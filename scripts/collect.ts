// Fetch the TSM files once and store any scan that is new.
//   npm run collect
import "dotenv/config";
import { collectAll } from "../src/lib/collector";
import { db } from "../src/lib/db";

async function main() {
  const results = await collectAll(db);
  for (const r of results) {
    const parts = [r.kind.padEnd(6), r.scope.padEnd(16), r.status];
    if (r.scanTime) parts.push(`scan ${r.scanTime}`);
    if (r.items) parts.push(`${r.items} items`);
    if (r.detail) parts.push(r.detail);
    console.log(parts.join("  "));
  }
  await db.$disconnect();
  if (results.some((r) => r.status === "error")) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
