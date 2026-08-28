export const quickOperationLabels = [
  "استلام مبلغ",
  "تمديد عقد",
  "تبديل سيارة",
  "إغلاق عقد",
  "استرجاع سيارة",
] as const;

export type QuickOperationLabel = (typeof quickOperationLabels)[number];

export const quickOperationMap: Record<QuickOperationLabel, "payment" | "extension" | "vehicle_swap" | "close" | "return"> = {
  "استلام مبلغ": "payment",
  "تمديد عقد": "extension",
  "تبديل سيارة": "vehicle_swap",
  "إغلاق عقد": "close",
  "استرجاع سيارة": "return",
};
