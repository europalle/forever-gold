import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { hashPassword, normalizeUsername, verifyPassword } from "../src/lib/password";

describe("passwords", () => {
  it("verifies the right password only, with a fresh salt each time", async () => {
    const a = await hashPassword("correct horse battery");
    const b = await hashPassword("correct horse battery");
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$32768$8$1$")).toBe(true);
    expect(await verifyPassword("correct horse battery", a)).toBe(true);
    expect(await verifyPassword("correct horse batterY", a)).toBe(false);
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
  });

  it("normalizes usernames, including WoW names with accents", () => {
    expect(normalizeUsername("  Bubbi ")).toBe("bubbi");
    expect(normalizeUsername("Tyliøn")).toBe("tyliøn");
    expect(normalizeUsername("a")).toBeNull();
    expect(normalizeUsername("has space")).toBeNull();
    expect(normalizeUsername("x".repeat(25))).toBeNull();
  });
});
