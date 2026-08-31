import { describe, expect, it } from "vitest";
import { shouldUseLocalAuth } from "../client/src/components/DashboardLayout";
import { hashEmailVerificationToken, isEmailVerificationTokenValid } from "./db";

describe("local authentication delivery", () => {
  it("selects local login on localhost without OAuth", () => {
    expect(shouldUseLocalAuth("localhost", false)).toBe(true);
    expect(shouldUseLocalAuth("127.0.0.1", false)).toBe(true);
    expect(shouldUseLocalAuth("preview.manus.computer", false)).toBe(false);
  });

  it("honors the explicit local-auth environment flag on any trusted app origin", () => {
    expect(shouldUseLocalAuth("office.example.test", true)).toBe(true);
  });

  it("hashes email verification tokens deterministically", () => {
    const token = "a".repeat(64);
    expect(hashEmailVerificationToken(token)).toHaveLength(64);
    expect(hashEmailVerificationToken(token)).toBe(hashEmailVerificationToken(token));
    expect(hashEmailVerificationToken(token)).not.toBe(token);
  });

  it("expires verification links at the boundary and rejects missing expiry", () => {
    const now = Date.parse("2026-09-01T12:00:00.000Z");
    expect(isEmailVerificationTokenValid(new Date(now + 1), now)).toBe(true);
    expect(isEmailVerificationTokenValid(new Date(now), now)).toBe(false);
    expect(isEmailVerificationTokenValid(null, now)).toBe(false);
  });
});
