import { beforeEach, describe, expect, it } from "vitest";
import { directDatabaseUrl, runtimeDatabaseUrl } from "../src/lib/database-url";
import { createToken, passwordMatches, verifyToken } from "../src/lib/session";

describe("session", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "a".repeat(64);
    process.env.APP_PASSWORD = "hunter2 gold";
  });

  it("accepts its own token and rejects tampering and expiry", async () => {
    const now = Date.now();
    const t = await createToken(now);
    expect(await verifyToken(t, now)).toBe(true);
    const [exp, sig] = t.split(".");
    expect(await verifyToken(`${Number(exp) + 1}.${sig}`, now)).toBe(false);
    expect(await verifyToken(`${exp}.${sig.replace(/^./, sig[0] === "0" ? "1" : "0")}`, now)).toBe(false);
    expect(await verifyToken(t, now + 31 * 86_400_000)).toBe(false);
    expect(await verifyToken(undefined)).toBe(false);
    expect(await verifyToken("garbage")).toBe(false);
  });

  it("rejects tokens signed with another secret", async () => {
    const t = await createToken();
    process.env.SESSION_SECRET = "b".repeat(64);
    expect(await verifyToken(t)).toBe(false);
  });

  it("refuses to run with a short secret", async () => {
    process.env.SESSION_SECRET = "short";
    await expect(createToken()).rejects.toThrow();
    expect(await verifyToken("1.ab")).toBe(false);
  });

  it("checks the password", async () => {
    expect(await passwordMatches("hunter2 gold")).toBe(true);
    expect(await passwordMatches("hunter2")).toBe(false);
    delete process.env.APP_PASSWORD;
    expect(await passwordMatches("")).toBe(false);
  });
});

describe("database URL", () => {
  it("skips Accelerate URLs and prefers a direct one for migrations", () => {
    const env = {
      DATABASE_URL: "prisma+postgres://accelerate.prisma-data.net/?api_key=x",
      POSTGRES_URL: "postgres://u:p@pooled/db",
      DATABASE_URL_UNPOOLED: "postgres://u:p@direct/db",
    };
    expect(runtimeDatabaseUrl(env)).toBe("postgres://u:p@pooled/db");
    expect(directDatabaseUrl(env)).toBe("postgres://u:p@direct/db");
    expect(runtimeDatabaseUrl({})).toBeUndefined();
  });

  it("finds variables behind a custom prefix from the Vercel connect dialog", () => {
    const env = {
      STORAGE_DATABASE_URL: "postgres://u:p@prefixed/db",
      STORAGE_PRISMA_DATABASE_URL: "prisma+postgres://accelerate/?api_key=x",
      STORAGE_POSTGRES_URL_NON_POOLING: "postgres://u:p@direct/db",
    };
    expect(runtimeDatabaseUrl(env)).toBe("postgres://u:p@prefixed/db");
    expect(directDatabaseUrl(env)).toBe("postgres://u:p@direct/db");
  });
});
