export const contractOperationOptions = [
  { value: "payment", label: "استلام مبلغ" },
  { value: "rate_update", label: "تعديل سعر التأجير" },
  { value: "extension", label: "تمديد العقد" },
  { value: "vehicle_swap", label: "تبديل السيارة" },
  { value: "suspend", label: "تعليق للتعثر" },
  { value: "close", label: "إغلاق العقد" },
  { value: "return", label: "استرجاع السيارة" },
] as const;

export type ContractOperationOption = (typeof contractOperationOptions)[number];
export type ContractOperation = ContractOperationOption["value"];

export function uniqueContractOperationOptions() {
  return contractOperationOptions.filter((option, index, all) => all.findIndex((candidate) => candidate.value === option.value) === index);
}

export const contractOperationValues = contractOperationOptions.map((option) => option.value);
