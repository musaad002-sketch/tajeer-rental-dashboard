export type RentalPeriod = {
  id?: number | string;
  startDate: string | Date;
  endDate: string | Date;
};

function toDay(value: string | Date): number {
  if (value instanceof Date) {
    return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) {
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid rental date: ${value}`);
  }
  return Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

/**
 * Rental periods are half-open intervals: [start, end).
 * This allows a vehicle returned on a day to be assigned to the next rental
 * starting on that same day, while still rejecting every real overlap.
 */
export function rentalPeriodsOverlap(
  requested: RentalPeriod,
  existing: RentalPeriod
): boolean {
  const requestedStart = toDay(requested.startDate);
  const requestedEnd = toDay(requested.endDate);
  const existingStart = toDay(existing.startDate);
  const existingEnd = toDay(existing.endDate);

  if (requestedEnd <= requestedStart || existingEnd <= existingStart) {
    throw new Error("Rental end date must be after its start date");
  }

  return requestedStart < existingEnd && requestedEnd > existingStart;
}

export type VehicleAvailabilityInput = {
  requested: RentalPeriod;
  activeRentals?: RentalPeriod[];
  vehicleState?: "available" | "reserved" | "rented" | "maintenance" | "unavailable";
  openMaintenanceCount?: number;
  excludedRental?: RentalPeriod;
};

/** Returns whether a vehicle can be assigned to the requested rental period. */
export function isVehicleAvailableForPeriod({
  requested,
  activeRentals = [],
  vehicleState = "available",
  openMaintenanceCount = 0,
  excludedRental,
}: VehicleAvailabilityInput): boolean {
  if (vehicleState !== "available" || openMaintenanceCount > 0) return false;

  return !activeRentals.some(
    rental =>
      !isExcludedRental(rental, excludedRental) &&
      rentalPeriodsOverlap(requested, rental)
  );
}

function isExcludedRental(
  rental: RentalPeriod,
  excludedRental: RentalPeriod | undefined
): boolean {
  if (!excludedRental) return false;
  if (rental === excludedRental) return true;
  return (
    rental.id !== undefined &&
    excludedRental.id !== undefined &&
    rental.id === excludedRental.id
  );
}

export function getVehicleAvailabilityReason(
  input: VehicleAvailabilityInput
): "available" | "vehicle_state" | "maintenance" | "date_conflict" {
  if ((input.vehicleState ?? "available") !== "available") return "vehicle_state";
  if ((input.openMaintenanceCount ?? 0) > 0) return "maintenance";
  if (
    (input.activeRentals ?? []).some(
      rental =>
        !isExcludedRental(rental, input.excludedRental) &&
        rentalPeriodsOverlap(input.requested, rental)
    )
  )
    return "date_conflict";
  return "available";
}

export function validateRentalPeriod(period: RentalPeriod): void {
  const start = toDay(period.startDate);
  const end = toDay(period.endDate);
  if (end <= start) throw new Error("Rental end date must be after its start date");
}

export const __private__ = { toDay };
