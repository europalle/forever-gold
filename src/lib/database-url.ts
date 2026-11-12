// Vercel's Postgres integrations name their variables differently, and some put
// a prisma+postgres:// Accelerate URL in DATABASE_URL. The pg driver needs a
// plain postgres:// string: take the first one found.

const RUNTIME = ["DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL"];
const DIRECT = ["DATABASE_URL_DIRECT", "DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING", ...RUNTIME];

type Env = Record<string, string | undefined>;

function pick(names: string[], env: Env): string | undefined {
  for (const n of names) {
    const v = env[n]?.trim();
    if (v && /^postgres(ql)?:\/\//.test(v)) return v;
  }
  return undefined;
}

export const runtimeDatabaseUrl = (env: Env = process.env) => pick(RUNTIME, env);
export const directDatabaseUrl = (env: Env = process.env) => pick(DIRECT, env);
