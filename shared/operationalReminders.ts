export type OperationalReminder = {
  type: "overdue" | "monthly_expiry" | "approval" | "payroll" | "liability" | "vehicle_note";
  audience: "all" | "manager" | "employee";
  title: string;
  description: string;
  severity: "warning" | "danger";
};

type ContractReminder = { contractNumber: string; status: string; type: "daily" | "monthly"; expectedReturnDate: Date | string; vehicleId?: number | null };
type PendingPayment = { id: number; contractNumber?: string | null; amount: string | number };
type PendingExpense = { id: number; description: string; amount: string | number };
type OfficeLiability = { id: number; description: string; amount: string | number; dueDate?: Date | string | null; status?: "open" | "partially_paid" | "paid" | "cancelled" };
type EmployeeReminder = { fullName: string; salary: string | number; payrollDueDate?: Date | string | null };
type VehicleNote = { vehicleId?: number; plateNumber: string; contractNumber?: string | null; contractStatus?: string; notes?: string | null; isClosed?: boolean; contractCreationAttempted?: boolean };

function dateOnly(value: Date | string) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(/T|\s/.test(value) ? value : `${value}T00:00:00`);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(from: Date | string, to: Date | string) {
  return Math.floor((dateOnly(to).getTime() - dateOnly(from).getTime()) / 86400000);
}

export function buildOperationalReminders(input: {
  contracts?: ContractReminder[];
  pendingPayments?: PendingPayment[];
  pendingExpenses?: PendingExpense[];
  liabilities?: OfficeLiability[];
  employees?: EmployeeReminder[];
  vehicleNotes?: VehicleNote[];
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const reminders: OperationalReminder[] = [];
  const seen = new Set<string>();
  const push = (reminder: OperationalReminder) => {
    const key = `${reminder.type}|${reminder.audience}|${reminder.title}|${reminder.description}`;
    if (!seen.has(key)) { seen.add(key); reminders.push(reminder); }
  };
  for (const contract of input.contracts ?? []) {
    const days = daysBetween(now, contract.expectedReturnDate);
    if (contract.status === "overdue" || days < 0) push({ type: "overdue", audience: "all", title: `العقد ${contract.contractNumber} متأخر`, description: `تاريخ التسليم المتوقع ${contract.expectedReturnDate}`, severity: "danger" });
    else if (contract.type === "monthly" && days <= 4) push({ type: "monthly_expiry", audience: "all", title: `العقد الشهري ${contract.contractNumber} يقترب من الاستحقاق`, description: `باقي ${days} يوم؛ أكد تمديد شهر جديد أو موعد التسليم.`, severity: "warning" });
  }
  for (const payment of input.pendingPayments ?? []) push({ type: "approval", audience: "manager", title: "دفعة بانتظار اعتماد المدير", description: `الدفعة #${payment.id} بقيمة ${Number(payment.amount).toFixed(2)} ر.س${payment.contractNumber ? ` للعقد ${payment.contractNumber}` : ""}.`, severity: "warning" });
  for (const expense of input.pendingExpenses ?? []) push({ type: "approval", audience: "manager", title: "مصروف بانتظار اعتماد المدير", description: `${expense.description} بقيمة ${Number(expense.amount).toFixed(2)} ر.س؛ مصروف #${expense.id}.`, severity: "warning" });
  for (const employee of input.employees ?? []) {
    if (!employee.payrollDueDate) continue;
    const days = daysBetween(now, employee.payrollDueDate);
    if (days <= 3) push({ type: "payroll", audience: "manager", title: `استحقاق راتب قريب: ${employee.fullName}`, description: `الراتب الدوري ${Number(employee.salary).toFixed(2)} ر.س يستحق خلال ${Math.max(0, days)} يوم.`, severity: days < 0 ? "danger" : "warning" });
  }
  for (const liability of input.liabilities ?? []) {
    if ((liability.status === "paid" || liability.status === "cancelled") || !liability.dueDate) continue;
    const days = daysBetween(now, liability.dueDate);
    if (days <= 7) push({ type: "liability", audience: "manager", title: "التزام مكتبي قريب الاستحقاق", description: `${liability.description} بقيمة ${Number(liability.amount).toFixed(2)} ر.س؛ الالتزام #${liability.id} يستحق ${liability.dueDate}.`, severity: days < 0 ? "danger" : "warning" });
  }
  for (const note of input.vehicleNotes ?? []) {
    if (!note.notes?.trim() || note.isClosed) continue;
    const details = `السيارة ${note.plateNumber}${note.contractNumber ? `؛ العقد ${note.contractNumber}` : ""}: ${note.notes.trim()}`;
    if (note.contractCreationAttempted) push({ type: "vehicle_note", audience: "employee", title: `تحقق من ملاحظة السيارة ${note.plateNumber} قبل إنشاء العقد`, description: details, severity: "danger" });
    if (note.contractCreationAttempted || note.contractStatus === "closed" || note.contractStatus === "returned") push({ type: "vehicle_note", audience: "manager", title: `ملاحظة غير مغلقة على السيارة ${note.plateNumber}`, description: details, severity: "warning" });
    else push({ type: "vehicle_note", audience: "employee", title: `ملاحظة غير مغلقة على السيارة ${note.plateNumber}`, description: details, severity: "warning" });
  }
  return reminders;
}
