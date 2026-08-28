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

export function buildOperationEffects(operation: ContractOperationType, amount = "0") {
  return {
    contractStatus: operation === "suspend" ? "suspended" : operation === "close" ? "closed" : operation === "return" ? "returned" : undefined,
    shouldCreatePayment: operation === "payment" && Number(amount) > 0,
    releasesVehicle: operation === "return" || operation === "close" || operation === "suspend",
    requiresReplacementVehicle: operation === "vehicle_swap",
  } as const;
}
