export function isValidVehicleModelYear(year: number) {
  return Number.isInteger(year) && year >= 1 && year <= 2100;
}
