export const paymentReasonOptions = [
  { value: "extra_km", label: "كيلوات إضافية" },
  { value: "international_authorization_fee", label: "رسوم تفويض دولي", internationalOnly: true },
  { value: "insurance_deductible", label: "نسبة تحمل التأمين" },
  { value: "vehicle_damage_compensation", label: "مبلغ تعويض لأضرار بالسيارة" },
  { value: "vehicle_cleaning_fee", label: "مبلغ رسوم تنظيف السيارة" },
] as const;

export type PaymentReason = (typeof paymentReasonOptions)[number]["value"];
export const paymentReasonLabels: Record<PaymentReason, string> = Object.fromEntries(paymentReasonOptions.map((option) => [option.value, option.label])) as Record<PaymentReason, string>;
