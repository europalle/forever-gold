import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { databaseEnvNames, runtimeDatabaseUrl } from "./database-url";

// One client per process; in dev, survive hot reloads.
const globalForDb = globalThis as unknown as { db?: PrismaClient };

function create() {
  const connectionString = runtimeDatabaseUrl();
  if (!connectionString) {
    const seen = databaseEnvNames().join(", ") || "none";
    throw new Error(`No postgres:// connection string found. Database variables present: ${seen}`);
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const db = globalForDb.db ?? create();
if (process.env.NODE_ENV !== "production") globalForDb.db = db;
