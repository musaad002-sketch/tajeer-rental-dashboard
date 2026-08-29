import { describe, expect, it } from "vitest";
import { canAccess, parsePermissions } from "./permissions";

describe("user permissions", () => {
  it("يعطي المدير صلاحية جميع الوحدات", () => {
    expect(canAccess("admin", "[]", "user_management")).toBe(true);
    expect(parsePermissions(null, "admin")).toContain("reports");
  });
  it("يقصر المستخدم التشغيلي على الصلاحيات المحفوظة", () => {
    expect(canAccess("user", '["contracts","operations"]', "contracts")).toBe(true);
    expect(canAccess("user", '["contracts","operations"]', "accounting")).toBe(false);
  });
});
