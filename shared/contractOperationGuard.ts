export type OperationRecord = {
  contractId: number;
  operation: string;
  amount?: string | null;
  paymentMethod?: string | null;
  vehicleId?: number | null;
  details?: string | null;
  completed?: boolean;
  contractStatus?: string | null;
};

export type PaymentException = "suspended_contract" | "previous_contract" | "legacy_unlinked" | "justified_non_suspended";

export function operationKey(input: { contractId: number; operation: string; vehicleId?: number | null; requestId?: string }) {
  return input.requestId?.trim() ? `request:${input.requestId.trim()}` : `${input.contractId}:${input.operation}:${input.vehicleId ?? "contract"}`;
}

export function findDuplicateOperation(records: OperationRecord[], input: { contractId: number; operation: string; amount?: string | null; paymentMethod?: string | null; vehicleId?: number | null; requestId?: string }) {
  const requestId = input.requestId?.trim();
  if (requestId && records.some(record => record.contractId === input.contractId && record.details?.includes(`[operation-request:${requestId}]`))) return records.find(record => record.details?.includes(`[operation-request:${requestId}]`)) ?? null;
  if (input.operation === "payment" && requestId) return null;
  return records.find(record => {
    if (record.completed === true || record.operation !== input.operation) return false;
    if (input.operation === "payment" && (record.amount !== input.amount || record.paymentMethod !== input.paymentMethod)) return false;
    const sameContract = record.contractId === input.contractId;
    const sameActiveVehicle = input.vehicleId != null && record.vehicleId === input.vehicleId && !["closed", "returned"].includes(record.contractStatus ?? "");
    return (sameContract || sameActiveVehicle) && (input.vehicleId == null || record.vehicleId == null || record.vehicleId === input.vehicleId);
  }) ?? null;
}

export function validatePaymentException(input: {
  exception?: PaymentException;
  reason?: string;
  contractStatus: string;
  contractCreatedAt: Date | string;
  hasContractNumber: boolean;
  now?: Date;
}) {
  if (!input.exception) return { allowed: false as const, audit: "" };
  const reason = input.reason?.trim();
  const cutoff = new Date("2026-09-15T00:00:00.000Z");
  const now = input.now ?? new Date();
  if (input.exception === "suspended_contract" && input.contractStatus !== "suspended") throw new Error("استثناء السداد للعقد المعلق يتطلب عقداً معلقاً");
  if (input.exception === "legacy_unlinked" && (input.hasContractNumber || new Date(input.contractCreatedAt) >= cutoff)) throw new Error("استثناء السداد التاريخي يتطلب عقداً قبل 15/09/2026 دون رقم عقد");
  if (input.exception === "justified_non_suspended" && (!reason || input.contractStatus === "suspended")) throw new Error("استثناء السداد غير المعلق يتطلب سبباً ولا ينطبق على عقد معلق");
  if (input.exception === "previous_contract" && (!reason || now < new Date(input.contractCreatedAt))) throw new Error("استثناء السداد لعقد سابق يتطلب سبباً صالحاً");
  return { allowed: true as const, audit: `استثناء سداد: ${input.exception}؛ السبب: ${reason || "ضمن القاعدة المعتمدة"}` };
}

export function appendOperationAudit(details: string | undefined, input: { requestId?: string; exceptionAudit?: string }) {
  return [details?.trim(), input.requestId?.trim() ? `[operation-request:${input.requestId.trim()}]` : "", input.exceptionAudit?.trim() || ""].filter(Boolean).join("؛ ");
}
