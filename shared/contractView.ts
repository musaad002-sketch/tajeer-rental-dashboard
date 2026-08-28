type ContractRow = {
  contract: { contractNumber: string; expectedReturnDate: Date | string; status: string; totalAmount: string; paidAmount: string };
  customer?: { fullName: string } | null;
  vehicle?: { make: string; model: string } | null;
};

export function formatContractRows(rows: ContractRow[]) {
  return rows.map(({ contract, customer, vehicle }) => ({
    id: `#${contract.contractNumber}`,
    customer: customer?.fullName ?? "عميل غير محدد",
    car: vehicle ? `${vehicle.make} ${vehicle.model}` : "سيارة غير محددة",
    delivery: new Date(contract.expectedReturnDate).toLocaleDateString("ar-SA"),
    overdue: contract.status === "overdue" ? "متأخر" : "—",
    due: `${Math.max(0, Number(contract.totalAmount) - Number(contract.paidAmount)).toLocaleString("ar-SA")} ر.س`,
    status: contract.status === "active" ? "ساري" : contract.status === "overdue" ? "متأخر" : contract.status === "suspended" ? "معلق" : contract.status === "returned" ? "مسترجع" : "مغلق",
    tone: contract.status === "active" ? "green" : contract.status === "overdue" ? "red" : "amber",
  }));
}
