// Vercel's Postgres integrations name their variables differently, can add a
// custom prefix when connected (STORAGE_DATABASE_URL), and some put a
// prisma+postgres:// Accelerate URL in DATABASE_URL. The pg driver needs a
// plain postgres:// string: take the best one found.

type Env = Record<string, string | undefined>;

const RUNTIME = ["DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL"];
const DIRECT = ["DATABASE_URL_DIRECT", "DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING"];

const isPlain = (v: string | undefined): v is string => !!v && /^postgres(ql)?:\/\//.test(v.trim());

// Exact names first, then the same names behind any prefix.
function pick(names: string[], env: Env): string | undefined {
  for (const n of names) if (isPlain(env[n])) return env[n]!.trim();
  for (const n of names) {
    const key = Object.keys(env).sort().find((k) => k.endsWith(`_${n}`) && isPlain(env[k]));
    if (key) return env[key]!.trim();
  }
  return undefined;
}

export const runtimeDatabaseUrl = (env: Env = process.env) => pick(RUNTIME, env);
export const directDatabaseUrl = (env: Env = process.env) => pick([...DIRECT, ...RUNTIME], env);

// For error messages: which database-looking variables exist, by name only.
export function databaseEnvNames(env: Env = process.env): string[] {
  return Object.keys(env)
    .filter((k) => /DATABASE_URL|POSTGRES/.test(k))
    .sort();
}
