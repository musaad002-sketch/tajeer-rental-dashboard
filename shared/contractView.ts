import { formatGregorianDate } from "./dateFormat";
import { calculateContractTotals } from "./contractTotals";
import { calculateContractBalances } from "./contractBalances";
type ContractRow = {
  contract: { contractNumber: string; expectedReturnDate: Date | string; status: string; totalAmount: string; paidAmount: string; rentalAmount?: string | number; type?: "daily" | "monthly"; actualReturnDate?: Date | string | null };
  customer?: { fullName: string } | null;
  vehicle?: { make: string; model: string; plateNumber?: string } | null;
};

export function formatContractRows(rows: ContractRow[]) {
  return rows.map(({ contract, customer, vehicle }) => {
    const totals = contract.rentalAmount != null && contract.type ? calculateContractTotals({ baseTotal: contract.totalAmount, expectedReturnDate: contract.expectedReturnDate, rentalAmount: contract.rentalAmount, type: contract.type, actualReturnDate: contract.actualReturnDate }) : { baseTotal: contract.totalAmount, delayDays: 0, delayTotal: "0.00", grandTotal: contract.totalAmount };
    const balances = calculateContractBalances({ baseTotal: totals.baseTotal, delayTotal: totals.delayTotal, paidAmount: contract.paidAmount });
    return {
    id: `#${contract.contractNumber}`,
    customer: customer?.fullName ?? "عميل غير محدد",
    car: vehicle ? `${vehicle.make} ${vehicle.model}` : "سيارة غير محددة",
    plate: vehicle?.plateNumber ?? "لوحة غير محددة",
    delivery: formatGregorianDate(contract.expectedReturnDate),
    overdue: contract.status === "overdue" ? "متأخر" : "—",
    due: `${Math.max(0, Number(contract.totalAmount) - Number(contract.paidAmount))} ر.س`,
    status: contract.status === "active" ? "ساري" : contract.status === "overdue" ? "متأخر" : contract.status === "suspended" ? "معلق" : contract.status === "returned" ? "مسترجع" : "مغلق",
    tone: contract.status === "active" ? "green" : contract.status === "overdue" ? "red" : "amber",
    delayDays: totals.delayDays,
    delayTotal: totals.delayTotal,
    previousOutstanding: balances.previousOutstanding,
    currentOutstanding: balances.currentOutstanding,
    grandOutstanding: balances.grandOutstanding,
  };
  });
}
