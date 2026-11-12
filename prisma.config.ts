import "dotenv/config";
import { defineConfig } from "prisma/config";
import { databaseEnvNames, directDatabaseUrl } from "./src/lib/database-url";

const url = directDatabaseUrl();
if (!url && process.argv.some((a) => a === "migrate" || a === "db")) {
  const seen = databaseEnvNames();
  console.error(
    "No postgres:// connection string found. " +
      (seen.length
        ? `Database variables present (names only): ${seen.join(", ")}. None holds a postgres:// URL.`
        : "No database variables are set: connect the database to the project, then redeploy."),
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations need a direct connection, not a pooler.
    url,
  },
});
