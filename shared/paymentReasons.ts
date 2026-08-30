export const paymentReasonOptions = [
  { value: "extra_km", label: "كيلوات إضافية", revenueType: "other" },
  { value: "international_authorization_fee", label: "رسوم تفويض دولي", internationalOnly: true, revenueType: "other" },
  { value: "insurance_deductible", label: "نسبة تحمل التأمين", revenueType: "other" },
  { value: "vehicle_damage_compensation", label: "مبلغ تعويض لأضرار بالسيارة", revenueType: "other" },
  { value: "vehicle_cleaning_fee", label: "مبلغ رسوم تنظيف السيارة", revenueType: "other" },
] as const;

export type PaymentReason = (typeof paymentReasonOptions)[number]["value"];
export const paymentReasonLabels: Record<PaymentReason, string> = Object.fromEntries(paymentReasonOptions.map((option) => [option.value, option.label])) as Record<PaymentReason, string>;
export const otherRevenueReasons = new Set<PaymentReason>(paymentReasonOptions.filter((option) => option.revenueType === "other").map((option) => option.value));
export function isOtherRevenueReason(reason?: string | null) {
  if (!reason) return false;
  if (otherRevenueReasons.has(reason as PaymentReason)) return true;
  return ["كيلوات إضافية", "رسوم تفويض دولي", "نسبة تحمل التأمين", "تعويض", "أضرار", "تنظيف السيارة"].some((label) => reason.includes(label));
}
