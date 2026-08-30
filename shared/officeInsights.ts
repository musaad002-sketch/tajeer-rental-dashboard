export type OfficeInsightSeverity = "info" | "warning" | "critical";

export type OfficeInsight = {
  code: string;
  severity: OfficeInsightSeverity;
  title: string;
  detail: string;
  entityType: "contract" | "vehicle" | "customer" | "operation" | "fleet";
  entityId?: number;
  evidence: Record<string, string | number>;
};

export type InsightDataset = {
  vehicles: Array<{ id: number; plateNumber: string; rentalDays: number; rentalRevenue: number; otherRevenue: number; maintenanceCost: number }>;
  customers: Array<{ id: number; fullName: string; previousContracts: number; latePaymentContracts: number }>;
  contracts: Array<{ id: number; contractNumber: string; customerId: number; hasAdvancePayment: boolean; durationDays: number; customerDataComplete: boolean; vehicleInsured: boolean; previousDelayDays: number; status: "active" | "overdue" | "suspended" | "closed" | "returned"; hasReturnOrExtension: boolean }>;
  operationsToday: Array<{ userId: number; userName: string; financial: boolean }>;
};

const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

export function buildOfficeInsights(data: InsightDataset): OfficeInsight[] {
  const insights: OfficeInsight[] = [];
  const rentalAverage = average(data.vehicles.map(vehicle => vehicle.rentalRevenue).filter(value => value > 0));
  for (const vehicle of data.vehicles) {
    if (vehicle.rentalDays >= 20 && rentalAverage > 0 && vehicle.rentalRevenue < rentalAverage * 0.65) insights.push({ code: "vehicle_revenue_below_average", severity: "warning", title: `إيراد السيارة ${vehicle.plateNumber} أقل من المعتاد`, detail: `تم تأجيرها ${vehicle.rentalDays} يوماً، وإيراد التأجير أقل من متوسط الأسطول بنسبة تزيد على 35%.`, entityType: "vehicle", entityId: vehicle.id, evidence: { rentalDays: vehicle.rentalDays, rentalRevenue: vehicle.rentalRevenue, fleetAverage: Number(rentalAverage.toFixed(2)) } });
    if (vehicle.rentalRevenue > 0 && vehicle.maintenanceCost > vehicle.rentalRevenue * 0.25) insights.push({ code: "vehicle_maintenance_above_ratio", severity: "warning", title: `مصروفات صيانة ${vehicle.plateNumber} مرتفعة`, detail: "تجاوزت مصروفات الصيانة 25% من إيراد التأجير المسجل للسيارة في الفترة.", entityType: "vehicle", entityId: vehicle.id, evidence: { rentalRevenue: vehicle.rentalRevenue, maintenanceCost: vehicle.maintenanceCost } });
  }
  for (const customer of data.customers) if (customer.previousContracts >= 3 && customer.latePaymentContracts === customer.previousContracts) insights.push({ code: "customer_repeated_late_payment", severity: "warning", title: `تكرار التأخر لدى العميل ${customer.fullName}`, detail: `لديه ${customer.previousContracts} عقود سابقة وجميعها تضمنت تأخير سداد مسجلاً.`, entityType: "customer", entityId: customer.id, evidence: { previousContracts: customer.previousContracts, latePaymentContracts: customer.latePaymentContracts } });
  const unresolved = data.contracts.filter(contract => ["closed", "returned"].includes(contract.status) && !contract.hasReturnOrExtension);
  if (unresolved.length) insights.push({ code: "closed_without_return_or_extension", severity: "critical", title: `${unresolved.length} عقود منتهية بلا تسليم أو تمديد`, detail: "هذه العقود تحتاج مراجعة تشغيلية وتوثيق عملية التسليم أو التمديد.", entityType: "fleet", evidence: { count: unresolved.length } });
  for (const contract of data.contracts) {
    if (!["active", "overdue", "suspended"].includes(contract.status)) continue;
    const score = calculateContractSafetyScore(contract);
    if (score < 75) insights.push({ code: "contract_risk_score", severity: score < 50 ? "critical" : "warning", title: `درجة أمان العقد ${contract.contractNumber}: ${score}/100`, detail: "المؤشر إرشادي للمدير ولا يرفض العميل تلقائياً.", entityType: "contract", entityId: contract.id, evidence: { score, previousDelayDays: contract.previousDelayDays, durationDays: contract.durationDays } });
  }
  const financialByUser = new Map<number, { userName: string; count: number }>();
  for (const operation of data.operationsToday) if (operation.financial) { const current = financialByUser.get(operation.userId) ?? { userName: operation.userName, count: 0 }; current.count++; financialByUser.set(operation.userId, current); }
  financialByUser.forEach((item, userId) => { if (item.count >= 10) insights.push({ code: "unusual_financial_activity", severity: "warning", title: `نشاط مالي مرتفع للموظف ${item.userName}`, detail: `سُجلت ${item.count} عمليات مالية اليوم، وتحتاج للمراجعة الإدارية.`, entityType: "operation", entityId: userId, evidence: { count: item.count } }); });
  return insights;
}

export function calculateContractSafetyScore(contract: InsightDataset["contracts"][number]): number {
  let score = 100;
  if (contract.previousDelayDays < 0) score -= 10;
  if (!contract.hasAdvancePayment) score -= 10;
  if (contract.durationDays > 30) score -= 5;
  if (contract.customerDataComplete) score += 10;
  if (contract.vehicleInsured) score += 5;
  return Math.max(0, Math.min(100, score));
}
