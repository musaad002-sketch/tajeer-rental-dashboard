import { calculateContractBalances } from "./contractBalances";
import { calculateContractTotals } from "./contractTotals";

export type DashboardFinancialRow = {
  totalAmount: string | number;
  expectedReturnDate: Date | string;
  rentalAmount: string | number;
  type: "daily" | "monthly";
  contractScope?: "domestic_limited" | "domestic_open" | "international";
  days?: number;
  actualReturnDate?: Date | string | null;
  paidAmount: string | number;
  excessMileageAmount?: string | number;
};

export function calculateDashboardOutstandingBreakdown(rows: DashboardFinancialRow[]) {
  const totals = rows.reduce((result, row) => {
    const contractTotals = calculateContractTotals({ baseTotal: row.totalAmount, expectedReturnDate: row.expectedReturnDate, rentalAmount: row.rentalAmount, type: row.type, contractScope: row.contractScope, days: row.days, actualReturnDate: row.actualReturnDate });
    const balances = calculateContractBalances({ baseTotal: contractTotals.baseTotal, delayTotal: contractTotals.delayTotal, paidAmount: row.paidAmount, excessMileageBalance: row.excessMileageAmount });
    result.previous += Number(balances.previousOutstanding);
    result.delay += Number(contractTotals.delayTotal);
    result.current += Number(balances.currentOutstanding);
    result.mileage += Number(balances.excessMileageOutstanding);
    return result;
  }, { previous: 0, delay: 0, current: 0, mileage: 0 });
  return {
    previousOutstanding: totals.previous.toFixed(2),
    delayOutstanding: totals.delay.toFixed(2),
    currentOutstanding: totals.current.toFixed(2),
    excessMileageOutstanding: totals.mileage.toFixed(2),
    grandOutstanding: (totals.previous + totals.current + totals.mileage).toFixed(2),
  };
}
