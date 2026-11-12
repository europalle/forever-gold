import { beforeEach, describe, expect, it } from "vitest";
import { directDatabaseUrl, runtimeDatabaseUrl } from "../src/lib/database-url";
import { bootstrapPasswordMatches, createToken, verifyToken } from "../src/lib/session";

describe("session", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "a".repeat(64);
    process.env.APP_PASSWORD = "hunter2 gold";
  });
  const me = { userId: "clx1abc", version: 3 };

  it("round-trips the user and version and rejects tampering and expiry", async () => {
    const now = Date.now();
    const t = await createToken(me, now);
    expect(await verifyToken(t, now)).toEqual(me);
    const [id, ver, exp, sig] = t.split(".");
    expect(await verifyToken(`otheruser.${ver}.${exp}.${sig}`, now)).toBeNull();
    expect(await verifyToken(`${id}.${Number(ver) + 1}.${exp}.${sig}`, now)).toBeNull();
    expect(await verifyToken(`${id}.${ver}.${Number(exp) + 1}.${sig}`, now)).toBeNull();
    expect(await verifyToken(t, now + 31 * 86_400_000)).toBeNull();
    expect(await verifyToken(undefined)).toBeNull();
    expect(await verifyToken("garbage")).toBeNull();
  });

  it("rejects tokens signed with another secret", async () => {
    const t = await createToken(me);
    process.env.SESSION_SECRET = "b".repeat(64);
    expect(await verifyToken(t)).toBeNull();
  });

  it("refuses to run with a short secret", async () => {
    process.env.SESSION_SECRET = "short";
    await expect(createToken(me)).rejects.toThrow();
  });

  it("checks the first-admin password", async () => {
    expect(await bootstrapPasswordMatches("hunter2 gold")).toBe(true);
    expect(await bootstrapPasswordMatches("hunter2")).toBe(false);
    delete process.env.APP_PASSWORD;
    expect(await bootstrapPasswordMatches("")).toBe(false);
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
