import { describe, expect, it } from "vitest";
import { canAccess, canPerform, parsePermissions } from "./permissions";

describe("user permissions", () => {
  it("يعطي المدير صلاحية جميع الوحدات", () => {
    expect(canAccess("admin", "[]", "user_management")).toBe(true);
    expect(parsePermissions(null, "admin")).toContain("reports");
  });
  it("يقصر المستخدم التشغيلي على الصلاحيات المحفوظة", () => {
    expect(canAccess("user", '["contracts","operations"]', "contracts")).toBe(true);
    expect(canAccess("user", '["contracts","operations"]', "accounting")).toBe(false);
  });
  it("يفرض الصلاحيات الذرية ولا يرفع صلاحيات المشغل تلقائياً", () => {
    expect(canPerform("admin", "[]", "dashboard.insights")).toBe(true);
    expect(canPerform("user", '["contracts.view","payments.create"]', "contracts.view")).toBe(true);
    expect(canPerform("user", '["contracts.view","payments.create"]', "contracts.delete")).toBe(false);
    expect(canPerform("user", '["contracts","operations"]', "contracts.view")).toBe(true);
    expect(canPerform("user", '["operations"]', "accounting.pay")).toBe(false);
  });
});
