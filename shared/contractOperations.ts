export type ContractOperationType = "new_contract" | "extension" | "payment" | "additional_fee" | "rate_update" | "vehicle_swap" | "suspend" | "close" | "return";

export function getContractReference(input: { contractId?: number; contractNumber?: string }) {
  const contractNumber = input.contractNumber?.trim();
  if (contractNumber) return { kind: "contractNumber", value: contractNumber } as const;
  if (input.contractId) return { kind: "contractId", value: input.contractId } as const;
  return null;
}

export function validateVehicleSwap(currentVehicleId: number, replacementVehicleId: number | undefined, replacementIsAvailable: boolean) {
  if (!replacementVehicleId || replacementVehicleId === currentVehicleId) return { ok: false as const, reason: "اختر سيارة بديلة مختلفة" };
  if (!replacementIsAvailable) return { ok: false as const, reason: "السيارة البديلة غير متاحة" };
  return { ok: true as const };
}

export function canSwapVehicleByThreshold(input: {
  contractTotal: string | number;
  previousOutstanding: string | number;
  currentOutstanding: string | number;
  excessMileageOutstanding?: string | number;
  includeExcessMileage?: boolean;
}) {
  const total = Number(input.contractTotal);
  if (!Number.isFinite(total) || total <= 0) {
    return { allowed: false as const, reason: "قيمة العقد غير صالحة" };
  }

  const previous = Math.max(0, Number(input.previousOutstanding) || 0);
  const current = Math.max(0, Number(input.currentOutstanding) || 0);
  const excess = input.includeExcessMileage
    ? Math.max(0, Number(input.excessMileageOutstanding) || 0)
    : 0;

  const threshold = total / 3;
  const owed = previous + current + excess;

  if (owed > threshold) {
    return {
      allowed: false as const,
      reason: `إجمالي المستحقات (${owed.toFixed(2)} ر.س) يتجاوز ثلث قيمة العقد (${threshold.toFixed(2)} ر.س)`,
      owed,
      threshold,
    };
  }

  return { allowed: true as const, owed, threshold };
}

export function buildOperationEffects(operation: ContractOperationType, amount = "0") {
  return {
    contractStatus: operation === "suspend" ? "suspended" : operation === "close" ? "closed" : operation === "return" ? "returned" : undefined,
    shouldCreatePayment: operation === "payment" && Number(amount) > 0,
    releasesVehicle: operation === "return" || operation === "close" || operation === "suspend",
    requiresReplacementVehicle: operation === "vehicle_swap",
  } as const;
}
