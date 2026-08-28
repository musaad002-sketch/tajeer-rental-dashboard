import { describe, expect, it } from "vitest";
import { canOpenNewContractFromVehicle, getPreselectedVehicleId } from "./contractEntry";

describe("contract entry flow", () => {
  it("accepts a contract entry only when a vehicle is selected", () => {
    expect(getPreselectedVehicleId("?vehicleId=42")).toBe("42");
    expect(canOpenNewContractFromVehicle("?vehicleId=42")).toBe(true);
  });

  it("blocks direct contract entry without a selected vehicle", () => {
    expect(getPreselectedVehicleId("")).toBe("");
    expect(canOpenNewContractFromVehicle("?customerId=7")).toBe(false);
  });
});
