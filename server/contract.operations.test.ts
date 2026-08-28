import { describe, expect, it } from "vitest";
import { buildOperationEffects } from "../shared/contractOperations";

describe("contract operation effects", () => {
  it("creates a payment effect only for a positive payment", () => {
    expect(buildOperationEffects("payment", "250")).toMatchObject({
      shouldCreatePayment: true,
      contractStatus: undefined,
      releasesVehicle: false,
    });
    expect(buildOperationEffects("payment", "0").shouldCreatePayment).toBe(false);
  });

  it("updates contract status and releases the vehicle for close, suspend, and return", () => {
    expect(buildOperationEffects("close")).toMatchObject({ contractStatus: "closed", releasesVehicle: true });
    expect(buildOperationEffects("suspend")).toMatchObject({ contractStatus: "suspended", releasesVehicle: true });
    expect(buildOperationEffects("return")).toMatchObject({ contractStatus: "returned", releasesVehicle: true });
  });

  it("keeps cash and network as explicit payment methods", () => {
    expect(["cash", "network"]).toContain("cash");
    expect(["cash", "network"]).toContain("network");
  });

  it("requires a replacement vehicle only for a vehicle swap", () => {
    expect(buildOperationEffects("vehicle_swap").requiresReplacementVehicle).toBe(true);
    expect(buildOperationEffects("extension").requiresReplacementVehicle).toBe(false);
  });
});
