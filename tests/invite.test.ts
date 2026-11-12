import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { hashInviteToken, inviteState, looksLikeToken, newInviteToken } from "../src/lib/invite";

describe("invites", () => {
  it("makes unguessable tokens and stores only their hash", () => {
    const a = newInviteToken();
    const b = newInviteToken();
    expect(a.token).not.toBe(b.token);
    expect(looksLikeToken(a.token)).toBe(true);
    expect(a.hash).toBe(hashInviteToken(a.token));
    expect(a.hash).not.toContain(a.token);
    expect(looksLikeToken("../../etc")).toBe(false);
  });

  it("knows open, used and expired", () => {
    const now = new Date("2026-11-12T12:00:00Z");
    const later = new Date("2026-11-19T12:00:00Z");
    expect(inviteState({ usedAt: null, expiresAt: later }, now)).toBe("open");
    expect(inviteState({ usedAt: now, expiresAt: later }, now)).toBe("used");
    expect(inviteState({ usedAt: null, expiresAt: now }, now)).toBe("expired");
  });
});
