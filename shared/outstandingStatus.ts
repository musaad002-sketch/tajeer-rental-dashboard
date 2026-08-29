export type OutstandingContractStatus = "active" | "overdue" | "suspended" | "closed" | "returned";

export function belongsToGeneralOutstanding(status: OutstandingContractStatus) {
  return status === "active" || status === "overdue";
}

export function sumOutstandingByStatus<T extends { status: OutstandingContractStatus; outstanding: number }>(rows: T[], status: OutstandingContractStatus) {
  return rows.filter((row) => row.status === status).reduce((sum, row) => sum + Math.max(0, row.outstanding), 0);
}
