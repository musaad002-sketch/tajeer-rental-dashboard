export type ExpenseApprovalStatus = "pending" | "approved" | "rejected";

export function isExpenseIncludedInNetRevenue(status: ExpenseApprovalStatus) {
  return status === "approved";
}
