export type FleetState = "available" | "reserved" | "rented" | "maintenance" | "unavailable";

export function getOperatingCycle(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const start = day >= 6 ? new Date(year, month, 6) : new Date(year, month - 1, 6);
  const end = day >= 6 ? new Date(year, month + 1, 5) : new Date(year, month, 5);
  return { start, end };
}

export function isContractOverdue(expectedReturnDate: Date, today = new Date()) {
  const due = new Date(expectedReturnDate); due.setHours(0, 0, 0, 0);
  const current = new Date(today); current.setHours(0, 0, 0, 0);
  return current > due;
}

export function isValidRentalPeriod(start: Date, end: Date) {
  return start.getTime() < end.getTime();
}

export function hasRentalPeriodOverlap(
  existingStart: Date,
  existingEnd: Date,
  requestedStart: Date,
  requestedEnd: Date
) {
  return (
    existingStart.getTime() < requestedEnd.getTime() &&
    requestedStart.getTime() < existingEnd.getTime()
  );
}

export function isVehicleAvailable(state: FleetState, activeContractCount = 0, openMaintenanceCount = 0) {
  return state === "available" && activeContractCount === 0 && openMaintenanceCount === 0;
}
