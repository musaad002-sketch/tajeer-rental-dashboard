import { describe, expect, it } from "vitest";
import { buildOperationalReminders } from "./operationalReminders";

describe("operational reminders", () => {
  const now = new Date("2026-09-15T09:00:00");

  it("creates daily overdue and monthly-cycle reminders up to four days ahead", () => {
    const reminders = buildOperationalReminders({ now, contracts: [
      { contractNumber: "1001", status: "overdue", type: "daily", expectedReturnDate: "2026-09-14" },
      { contractNumber: "1002", status: "active", type: "monthly", expectedReturnDate: "2026-09-19" },
    ]});
    expect(reminders.map((item) => item.type)).toEqual(["overdue", "monthly_expiry"]);
  });

  it("does not invent a payroll date from the hire date", () => {
    expect(buildOperationalReminders({ now, employees: [{ fullName: "موظف", salary: "5000" }] })).toEqual([]);
  });

  it("uses an explicit payroll due date when one is provided", () => {
    const reminders = buildOperationalReminders({ now, employees: [{ fullName: "موظف", salary: "5000", payrollDueDate: "2026-09-16" }] });
    expect(reminders[0]).toMatchObject({ type: "payroll", audience: "manager" });
  });

  it("notifies managers about pending payments and expenses", () => {
    const reminders = buildOperationalReminders({ now, pendingPayments: [{ id: 11, contractNumber: "1001", amount: "250" }], pendingExpenses: [{ id: 12, description: "صيانة", amount: "400" }] });
    expect(reminders).toHaveLength(2);
    expect(reminders.every((item) => item.audience === "manager" && item.type === "approval")).toBe(true);
  });

  it("uses only explicit actual liabilities for liability reminders", () => {
    const reminders = buildOperationalReminders({ now, pendingExpenses: [{ id: 12, description: "مصروف عادي", amount: "2000" }], liabilities: [{ id: 13, description: "إيجار المكتب", amount: "2000", dueDate: "2026-09-20", status: "open" }] });
    expect(reminders.map((item) => item.type)).toEqual(["approval", "liability"]);
    expect(reminders.find((item) => item.type === "liability")?.description).toContain("الالتزام #13");
  });

  it("alerts the employee before a new contract and the manager after proceeding", () => {
    const reminders = buildOperationalReminders({ now, vehicleNotes: [{ plateNumber: "ABC 123", contractNumber: "1001", notes: "فحص خدش الباب", contractCreationAttempted: true }] });
    expect(reminders.map((item) => item.audience)).toEqual(["employee", "manager"]);
  });

  it("alerts the manager about an open vehicle note after contract closure", () => {
    const reminders = buildOperationalReminders({ now, vehicleNotes: [{ plateNumber: "ABC 123", contractNumber: "1001", contractStatus: "closed", notes: "فحص خدش الباب" }] });
    expect(reminders[0]).toMatchObject({ type: "vehicle_note", audience: "manager", severity: "warning" });
  });

  it("deduplicates the same event and ignores closed notes and settled liabilities", () => {
    const reminders = buildOperationalReminders({ now,
      pendingPayments: [{ id: 11, contractNumber: "1001", amount: "250" }, { id: 11, contractNumber: "1001", amount: "250" }],
      liabilities: [{ id: 13, description: "مدفوع", amount: "2000", dueDate: "2026-09-16", status: "paid" }],
      vehicleNotes: [{ plateNumber: "ABC 123", contractNumber: "1001", notes: "مغلقة", isClosed: true }],
    });
    expect(reminders).toHaveLength(1);
  });
});
