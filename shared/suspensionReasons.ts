export const suspensionReasonOptions = [
  { value: "insurance_deductible_claim", label: "وجود مطالبة نسبة تحمل التأمين" },
  { value: "vehicle_damage_claim", label: "وجود مطالبة أضرار بالسيارة" },
  { value: "vehicle_cleaning_fee", label: "وجود رسوم تنظيف السيارة" },
  { value: "financial_default", label: "تعثر أو تأخر مالي" },
  { value: "customer_request", label: "طلب العميل" },
  { value: "other", label: "سبب آخر" },
] as const;

export type SuspensionReason = (typeof suspensionReasonOptions)[number]["value"];
export const suspensionReasonLabels: Record<SuspensionReason, string> = Object.fromEntries(
  suspensionReasonOptions.map((option) => [option.value, option.label]),
) as Record<SuspensionReason, string>;
