import { describe, expect, it } from "vitest";
import { cronAuthorized } from "../src/lib/cron-auth";

const S = "abc123secret";

describe("cronAuthorized", () => {
  it("accepts the secret with copy-paste noise", () => {
    expect(cronAuthorized(`Bearer ${S}`, S)).toBe(true);
    expect(cronAuthorized(`bearer   ${S}  `, S)).toBe(true);
    expect(cronAuthorized(`Bearer "${S}"`, S)).toBe(true);
    expect(cronAuthorized(`Bearer ${S}`, ` ${S}\n`)).toBe(true);
  });

  it("rejects anything else", () => {
    expect(cronAuthorized(`Bearer ${S}x`, S)).toBe(false);
    expect(cronAuthorized(S, S)).toBe(false); // no Bearer
    expect(cronAuthorized(`Basic ${S}`, S)).toBe(false);
    expect(cronAuthorized(null, S)).toBe(false);
    expect(cronAuthorized(`Bearer ${S}`, undefined)).toBe(false);
    expect(cronAuthorized("Bearer ", "")).toBe(false);
  });
});
