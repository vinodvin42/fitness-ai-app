import Constants from "expo-constants";

/** The app's own brand text. The Figma export says "FynroX"; the product ships as 23PrimeFit. */
export const BRAND_NAME = "23PrimeFit";

/**
 * Where "Email Us" sends mail. Build-time EXPO_PUBLIC_SUPPORT_EMAIL wins, then
 * app.json extra.supportEmail; when neither is set the Email Us card is hidden.
 */
export const SUPPORT_EMAIL: string | null =
  (process.env.EXPO_PUBLIC_SUPPORT_EMAIL as string | undefined) ||
  ((Constants.expoConfig?.extra?.supportEmail as string | undefined) ?? null) ||
  null;
