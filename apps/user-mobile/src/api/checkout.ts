import { apiClient } from "./client";

/**
 * U-M1's data. Every number here comes from the server — decision #7:
 * "No hard-coded prices in the app; prices come from the Commerce API."
 */
export type CheckoutMethodId = "upi" | "card" | "netbanking";

export type CheckoutQuote = {
  purpose: "subscription" | "program_purchase";
  referenceId: string;
  itemName: string;
  currency: string;
  listPriceCents: number;
  discountCents: number;
  totalCents: number;
  gst: { percent: number; netCents: number; taxCents: number; inclusive: true } | null;
  couponCode: string | null;
  couponError: string | null;
  methods: Array<{ id: CheckoutMethodId; label: string; available: boolean }>;
  trialAvailable: boolean;
  canPay: boolean;
};

export type PurchaseRecord = {
  id: string;
  purpose: string;
  referenceId: string;
  amountCents: number;
  currency: string;
  status: string;
  couponCode: string | null;
  discountCents: number;
  createdAt: string;
  refund: {
    status: string;
    refundedCents: number;
    isPartial: boolean;
    requestedAt: string;
    processedAt: string | null;
  } | null;
  activationFailed: boolean;
};

export function fetchCheckoutQuote(params: {
  purpose: "subscription" | "program_purchase";
  referenceId: string;
  code?: string;
}) {
  return apiClient.get<CheckoutQuote>("/checkout/quote", { params }).then((r) => r.data);
}

export function fetchPurchaseHistory() {
  return apiClient.get<PurchaseRecord[]>("/checkout/purchases").then((r) => r.data);
}
