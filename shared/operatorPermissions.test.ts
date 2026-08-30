import { describe, expect, it } from "vitest";
import { isOperatorVisibleContractStatus, parsePermissions } from "./permissions";

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
});
