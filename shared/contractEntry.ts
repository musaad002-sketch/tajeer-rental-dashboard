export function getPreselectedVehicleId(search: string) {
  return new URLSearchParams(search).get("vehicleId") ?? "";
}

export function canOpenNewContractFromVehicle(search: string) {
  return Boolean(getPreselectedVehicleId(search));
}
