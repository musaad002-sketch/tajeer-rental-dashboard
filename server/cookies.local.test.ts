import { describe, expect, it } from "vitest";
import { getSessionCookieOptions } from "./_core/cookies";

function request(protocol: string, host = "localhost") {
  return { protocol, hostname: host, headers: {} } as any;
}

describe("local session cookie", () => {
  it("uses lax and non-secure cookies on localhost HTTP", () => {
    expect(getSessionCookieOptions(request("http"))).toMatchObject({
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: false,
    });
  });

  it("uses secure cookies for HTTPS deployments", () => {
    expect(getSessionCookieOptions(request("https"))).toMatchObject({
      sameSite: "none",
      secure: true,
    });
  });
});
