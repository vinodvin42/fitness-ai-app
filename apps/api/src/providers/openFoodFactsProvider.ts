import { lookupBarcode } from "../lib/openFoodFactsClient";
import type { FoodDataProvider } from "./types";
import type { BarcodeLookupResult } from "../lib/openFoodFactsClient";

/**
 * D8's real implementation — the existing Open Food Facts client, behind
 * the interface. The client itself is unchanged; this only makes the
 * choice of vendor a config value.
 */
export const openFoodFactsProvider: FoodDataProvider = {
  name: "openfoodfacts",

  // Open Food Facts needs no credentials, so it is always "configured"
  // in the credential sense. Reachability is a per-call concern the
  // client already handles by returning `{ found: false }`.
  isConfigured() {
    return true;
  },

  async lookupBarcode(barcode: string): Promise<BarcodeLookupResult> {
    return lookupBarcode(barcode);
  },
};
