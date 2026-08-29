export type ContractScope = "domestic_limited" | "domestic_open" | "international";
export type ContractType = "daily" | "monthly";

export const contractScopeOptions = [
  { value: "domestic_limited" as const, label: "داخلي — 150 كم يومياً", kilometerPolicy: "150 كم يومياً" },
  { value: "domestic_open" as const, label: "خارجي داخل السعودية — عداد مفتوح", kilometerPolicy: "عداد مفتوح" },
  { value: "international" as const, label: "خارجي دولي", kilometerPolicy: "عداد مفتوح" },
];

export function isInternationalContract(scope: ContractScope | null | undefined) {
  return scope === "international";
}

export function requiresInternationalAuthorizationFee(scope: ContractScope | null | undefined) {
  return isInternationalContract(scope);
}

export function canChargeMonthlyAuthorizationFee(scope: ContractScope | null | undefined, type: ContractType, alreadyChargedThisMonth: boolean) {
  return isInternationalContract(scope) && (type !== "monthly" || !alreadyChargedThisMonth);
}
