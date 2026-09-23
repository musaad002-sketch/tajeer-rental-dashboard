import { describe, expect, it } from "vitest";
import { appendOperationAudit, findDuplicateOperation, operationKey, validatePaymentException } from "./contractOperationGuard";

describe("contract operation duplicate guard", () => {
  const existing = [{ contractId: 10, operation: "close", vehicleId: 4, details: "إغلاق" }];

  it("allows a valid operation when no matching operation exists", () => {
    expect(findDuplicateOperation(existing, { contractId: 10, operation: "return", vehicleId: 4 })).toBeNull();
  });

  it("rejects a repeated operation on the same contract and vehicle", () => {
    expect(findDuplicateOperation(existing, { contractId: 10, operation: "close", vehicleId: 4 })).toEqual(existing[0]);
  });

  it("rejects the same management operation on a vehicle held by another active contract", () => {
    expect(findDuplicateOperation([{ contractId: 11, operation: "vehicle_swap", vehicleId: 4, contractStatus: "active" }], { contractId: 12, operation: "vehicle_swap", vehicleId: 4 })).not.toBeNull();
  });

  it("allows the vehicle to be reused after the previous contract is closed or returned", () => {
    expect(findDuplicateOperation([{ contractId: 11, operation: "vehicle_swap", vehicleId: 4, contractStatus: "closed" }], { contractId: 12, operation: "vehicle_swap", vehicleId: 4 })).toBeNull();
    expect(findDuplicateOperation([{ contractId: 11, operation: "vehicle_swap", vehicleId: 4, contractStatus: "returned" }], { contractId: 12, operation: "vehicle_swap", vehicleId: 4 })).toBeNull();
  });

  it("rejects an operation that remains incomplete", () => {
    expect(findDuplicateOperation([{ contractId: 10, operation: "vehicle_swap", vehicleId: 4, completed: false }], { contractId: 10, operation: "vehicle_swap", vehicleId: 4 })).not.toBeNull();
    expect(findDuplicateOperation([{ contractId: 10, operation: "vehicle_swap", vehicleId: 4, completed: true }], { contractId: 10, operation: "vehicle_swap", vehicleId: 4 })).toBeNull();
  });

  it("uses a stable request id to reject concurrent/replayed requests", () => {
    const requestId = "req-2026-09-15-001";
    expect(operationKey({ contractId: 10, operation: "close", vehicleId: 4, requestId })).toBe(`request:${requestId}`);
    const record = { contractId: 10, operation: "close", vehicleId: 4, details: `[operation-request:${requestId}]` };
    expect(findDuplicateOperation([record], { contractId: 10, operation: "close", vehicleId: 4, requestId })).toEqual(record);
  });

  it("allows distinct payment installments but rejects the same payment replay", () => {
    const first = { contractId: 10, operation: "payment", amount: "300.00", paymentMethod: "cash", vehicleId: 4, details: "first" };
    expect(findDuplicateOperation([first], { contractId: 10, operation: "payment", amount: "350.00", paymentMethod: "network", vehicleId: 4, requestId: "payment-2" })).toBeNull();
    expect(findDuplicateOperation([first], { contractId: 10, operation: "payment", amount: "300.00", paymentMethod: "cash", vehicleId: 4 })).toEqual(first);
    const replay = { ...first, details: "first; [operation-request:payment-1]" };
    expect(findDuplicateOperation([replay], { contractId: 10, operation: "payment", amount: "300.00", paymentMethod: "cash", vehicleId: 4, requestId: "payment-1" })).toEqual(replay);
  });

  it("allows each approved payment exception and records its context", () => {
    const cases = [
      { exception: "suspended_contract" as const, contractStatus: "suspended", contractCreatedAt: "2026-09-15", hasContractNumber: true },
      { exception: "previous_contract" as const, contractStatus: "closed", contractCreatedAt: "2026-09-14", hasContractNumber: true, reason: "سداد عقد سابق" },
      { exception: "legacy_unlinked" as const, contractStatus: "closed", contractCreatedAt: "2026-09-14", hasContractNumber: false },
      { exception: "justified_non_suspended" as const, contractStatus: "active", contractCreatedAt: "2026-09-15", hasContractNumber: true, reason: "سداد مبرر" },
    ];
    for (const input of cases) expect(validatePaymentException(input)).toMatchObject({ allowed: true });
    expect(appendOperationAudit("دفعة", { requestId: "req-1", exceptionAudit: "استثناء سداد: مبرر" })).toContain("req-1");
    expect(appendOperationAudit("دفعة", { requestId: "req-1", exceptionAudit: "استثناء سداد: مبرر" })).toContain("استثناء سداد");
  });

  it("keeps duplicate detection independent from payment exception validation", () => {
    const duplicate = { contractId: 10, operation: "close", vehicleId: 4, details: "إغلاق" };
    expect(findDuplicateOperation([duplicate], { contractId: 10, operation: "close", vehicleId: 4 })).toEqual(duplicate);
    expect(validatePaymentException({ exception: "justified_non_suspended", contractStatus: "active", contractCreatedAt: "2026-09-15", hasContractNumber: true, reason: "سبب واضح" }).allowed).toBe(true);
  });

  it("rejects exceptions when required context is missing or invalid", () => {
    expect(() => validatePaymentException({ exception: "suspended_contract", contractStatus: "active", contractCreatedAt: "2026-09-15", hasContractNumber: true })).toThrow();
    expect(() => validatePaymentException({ exception: "legacy_unlinked", contractStatus: "closed", contractCreatedAt: "2026-09-15", hasContractNumber: false })).toThrow();
    expect(() => validatePaymentException({ exception: "justified_non_suspended", contractStatus: "active", contractCreatedAt: "2026-09-15", hasContractNumber: true })).toThrow();
    expect(() => validatePaymentException({ exception: "previous_contract", contractStatus: "closed", contractCreatedAt: "2026-09-15", hasContractNumber: true })).toThrow();
  });
});
