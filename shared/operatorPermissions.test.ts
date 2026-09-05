import { describe, expect, it } from "vitest";
import { canPerform, isOperatorVisibleContractStatus, parseGranularPermissions, parsePermissions } from "./permissions";

describe("operator permissions", () => {
  it("allows only active, overdue, and suspended contracts", () => {
    expect(isOperatorVisibleContractStatus("active")).toBe(true);
    expect(isOperatorVisibleContractStatus("overdue")).toBe(true);
    expect(isOperatorVisibleContractStatus("suspended")).toBe(true);
    expect(isOperatorVisibleContractStatus("closed")).toBe(false);
    expect(isOperatorVisibleContractStatus("returned")).toBe(false);
  });

  it("does not include reports or user management in defaults", () => {
    const permissions = parsePermissions(JSON.stringify(["dashboard", "contracts", "operations", "accounting", "maintenance"]), "user");
    expect(permissions).not.toContain("reports");
    expect(permissions).not.toContain("user_management");
  });

  it("allows daily accounting access without aggregate report access", () => {
    const permissions = parseGranularPermissions(null, "user");
    expect(canPerform("user", JSON.stringify(permissions), "accounting.view")).toBe(true);
    expect(canPerform("user", JSON.stringify(permissions), "reports.view")).toBe(false);
    expect(canPerform("user", JSON.stringify(permissions), "reports.export")).toBe(false);
  });
});
