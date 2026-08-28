import { describe, expect, it } from "vitest";
import { buildOAuthRedirectUri, registerOAuthRoutes } from "./_core/oauth";

describe("OAuth start flow", () => {
  it("uses the browser origin when provided by the mobile client", () => {
    const req = { protocol: "http", headers: { "x-forwarded-proto": "https" }, get: () => "internal-proxy" } as any;
    expect(buildOAuthRedirectUri(req, "https://mobile.example.test/")).toBe("https://mobile.example.test/api/oauth/callback");
  });

  it("falls back safely for an invalid origin", () => {
    const req = { protocol: "https", headers: {}, get: () => "example.test" } as any;
    expect(buildOAuthRedirectUri(req, "javascript:alert(1)")).toBe("https://example.test/api/oauth/callback");
  });
  it("sets a first-party state cookie and redirects to the OAuth portal", () => {
    const routes: Record<string, (req: any, res: any) => void> = {};
    const app = { get: (path: string, handler: (req: any, res: any) => void) => { routes[path] = handler; } } as any;
    registerOAuthRoutes(app);
    const headers: Record<string, string> = {};
    const response = { cookie: (_name: string, value: string, options: Record<string, unknown>) => { headers.cookie = `${value}; ${Object.entries(options).map(([key, item]) => `${key}=${item}`).join("; ")}`; }, redirect: (_code: number, location: string) => { headers.location = location; }, status: () => response, json: () => response };
    routes["/api/oauth/start"]({ protocol: "https", headers: { "x-forwarded-proto": "https" }, query: { origin: "https://mobile.example.test/" }, get: () => "internal-proxy" }, response);
    expect(headers.location).toContain("redirectUri=https%3A%2F%2Fmobile.example.test%2Fapi%2Foauth%2Fcallback");
    expect(headers.location).toContain("state=");
    expect(headers.cookie).toContain("httpOnly=true");
    expect(headers.cookie).toContain("sameSite=none");
    expect(headers.cookie).toContain("secure=true");
  });
});
