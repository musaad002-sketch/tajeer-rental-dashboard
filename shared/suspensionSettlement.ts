export function statusAfterSuspendedSettlement(input: { status: "active" | "overdue" | "suspended" | "closed" | "returned"; outstanding: string | number; expectedReturnDate: Date | string; now?: Date }) {
  if (input.status !== "suspended" || Number(input.outstanding) > 0) return null;
  const now = input.now ?? new Date();
  const expected = new Date(input.expectedReturnDate);
  now.setHours(0, 0, 0, 0);
  expected.setHours(0, 0, 0, 0);
  return expected < now ? "overdue" as const : "active" as const;
}
