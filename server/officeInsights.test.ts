import { describe, expect, it } from "vitest";
import { buildOfficeInsights, calculateContractSafetyScore, type InsightDataset } from "@shared/officeInsights";

const contract: InsightDataset["contracts"][number] = { id: 2451, contractNumber: "2451", customerId: 1, hasAdvancePayment: false, durationDays: 45, customerDataComplete: true, vehicleInsured: true, previousDelayDays: -1, status: "active", hasReturnOrExtension: true };

describe("Office Eye insights", () => {
  it("calculates the illustrative contract safety score without blocking the contract", () => {
    expect(calculateContractSafetyScore(contract)).toBe(90);
  });

  it("does not flag insufficient vehicle history", () => {
    const data: InsightDataset = { vehicles: [{ id: 1, plateNumber: "GXR 8932", rentalDays: 28, rentalRevenue: 650, otherRevenue: 0, maintenanceCost: 20 }, { id: 2, plateNumber: "GXR 8933", rentalDays: 28, rentalRevenue: 700, otherRevenue: 0, maintenanceCost: 30 }], customers: [], contracts: [], operationsToday: [] };
    expect(buildOfficeInsights(data)).toEqual([]);
  });

  it("explains repeated late payment and unusual financial activity", () => {
    const data: InsightDataset = { vehicles: [], customers: [{ id: 1, fullName: "عميل تجريبي", previousContracts: 3, latePaymentContracts: 3 }], contracts: [], operationsToday: Array.from({ length: 10 }, (_, index) => ({ userId: 7, userName: "أحمد", financial: true })) };
    const insights = buildOfficeInsights(data);
    expect(insights.map(item => item.code)).toEqual(["customer_repeated_late_payment", "unusual_financial_activity"]);
  });
});
