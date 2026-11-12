import "dotenv/config";
import { defineConfig } from "prisma/config";
import { directDatabaseUrl } from "./src/lib/database-url";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations need a direct connection, not a pooler.
    url: directDatabaseUrl(),
  },
});
