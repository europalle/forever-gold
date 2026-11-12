import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { runtimeDatabaseUrl } from "./database-url";

// One client per process; in dev, survive hot reloads.
const globalForDb = globalThis as unknown as { db?: PrismaClient };

function create() {
  const connectionString = runtimeDatabaseUrl();
  if (!connectionString) throw new Error("No postgres:// URL in DATABASE_URL or POSTGRES_URL");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const db = globalForDb.db ?? create();
if (process.env.NODE_ENV !== "production") globalForDb.db = db;
