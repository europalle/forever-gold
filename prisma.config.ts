import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations need a direct connection, not a pooler.
    url: process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL,
  },
});
