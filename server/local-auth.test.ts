import { describe, expect, it } from "vitest";
import { shouldUseLocalAuth } from "../client/src/components/DashboardLayout";

describe("local authentication delivery", () => {
  it("selects local login on localhost without OAuth", () => {
    expect(shouldUseLocalAuth("localhost", false)).toBe(true);
    expect(shouldUseLocalAuth("127.0.0.1", false)).toBe(true);
    expect(shouldUseLocalAuth("preview.manus.computer", false)).toBe(false);
  });

  it("honors the explicit local-auth environment flag on any trusted app origin", () => {
    expect(shouldUseLocalAuth("office.example.test", true)).toBe(true);
  });
});
