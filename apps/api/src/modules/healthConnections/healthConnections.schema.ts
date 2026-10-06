import { z } from "zod";

export const healthProviderSchema = z.enum(["apple_health", "health_connect", "garmin", "fitbit", "whoop", "oura"]);

export const connectHealthSchema = z.object({
  provider: healthProviderSchema,
  scopes: z.array(z.string().min(1).max(64)).max(30).default([]),
});
export type ConnectHealthInput = z.infer<typeof connectHealthSchema>;
