import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPasswordResetUrl,
  clearPasswordResetRateLimitForTests,
  consumePasswordResetRateLimit,
  hashPasswordResetRateLimitEmail,
  normalizePasswordResetEmail,
  passwordResetLimits,
  sendPasswordResetEmail,
} from "./passwordReset";

afterEach(() => {
  clearPasswordResetRateLimitForTests();
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;
});

describe("password reset security helpers", () => {
  it("normalizes email keys and never includes the email in the rate-limit key", () => {
    expect(normalizePasswordResetEmail("  User@Example.COM ")).toBe("user@example.com");
    expect(hashPasswordResetRateLimitEmail("User@Example.com")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashPasswordResetRateLimitEmail("User@Example.com")).not.toContain("User");
  });

  it("limits repeated requests by key", () => {
    const now = 1_000_000;
    for (let attempt = 0; attempt < passwordResetLimits.maxRequestsPerKey; attempt++)
      expect(consumePasswordResetRateLimit(["ip:test"], now + attempt)).toBe(true);
    expect(consumePasswordResetRateLimit(["ip:test"], now + 10)).toBe(false);
    expect(consumePasswordResetRateLimit(["ip:test"], now + passwordResetLimits.windowMs + 1)).toBe(true);
  });

  it("builds an encoded reset URL without exposing the token in logs or storage helpers", () => {
    expect(buildPasswordResetUrl("https://app.example/", "abc+/token")).toBe(
      "https://app.example/reset-password?token=abc%2B%2Ftoken"
    );
  });

  it("sends only the reset link, never a password, through the configured provider", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM_EMAIL = "Tajeer <no-reply@example.test>";
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendPasswordResetEmail({
      to: "user@example.test",
      resetUrl: "https://app.example/reset-password?token=test-token",
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.to).toEqual(["user@example.test"]);
    expect(body.text).toContain("test-token");
    expect(body.text).not.toContain("Secret123!");
  });
});
