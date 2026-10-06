import { z } from "zod";

export const pairDeviceSchema = z.object({
  provider: z.enum(["apple_health", "health_connect", "garmin", "fitbit", "whoop", "oura"]),
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["watch", "band", "ring", "scale", "other"]).default("other"),
  batteryPct: z.number().int().min(0).max(100).optional(),
});
export type PairDeviceInput = z.infer<typeof pairDeviceSchema>;

// One day's samples as read on-device by the mobile client.
export const syncSampleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  restingHr: z.number().int().min(20).max(220).optional(),
  sleepHours: z.number().min(0).max(24).optional(),
  hrvMs: z.number().int().min(0).max(400).optional(),
  steps: z.number().int().min(0).max(200000).optional(),
});

export const syncDeviceSchema = z.object({
  samples: z.array(syncSampleSchema).max(90),
  batteryPct: z.number().int().min(0).max(100).optional(),
  // Client-reported failure (e.g. permission revoked mid-sync).
  error: z.string().trim().max(300).optional(),
});
export type SyncDeviceInput = z.infer<typeof syncDeviceSchema>;
