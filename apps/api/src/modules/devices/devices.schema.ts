import { z } from "zod";

export const DEVICE_PERMISSIONS = ["steps", "heart_rate", "sleep", "spo2", "stress", "workouts"] as const;
export const devicePermissionSchema = z.enum(DEVICE_PERMISSIONS);
export type DevicePermission = (typeof DEVICE_PERMISSIONS)[number];

export const pairDeviceSchema = z.object({
  provider: z.enum(["apple_health", "health_connect", "garmin", "fitbit", "whoop", "oura"]),
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["watch", "band", "ring", "scale", "other"]).default("other"),
  batteryPct: z.number().int().min(0).max(100).optional(),
  // Data this device is allowed to supply; omitted = everything.
  permissions: z.array(devicePermissionSchema).max(6).optional(),
});

export const updateDeviceSchema = z.object({
  permissions: z.array(devicePermissionSchema).max(6),
});
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;
export type PairDeviceInput = z.infer<typeof pairDeviceSchema>;

// One day's samples as read on-device by the mobile client.
export const syncSampleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  restingHr: z.number().int().min(20).max(220).optional(),
  sleepHours: z.number().min(0).max(24).optional(),
  hrvMs: z.number().int().min(0).max(400).optional(),
  steps: z.number().int().min(0).max(200000).optional(),
  activeCalories: z.number().int().min(0).max(20000).optional(),
  activeMinutes: z.number().int().min(0).max(1440).optional(),
  spo2: z.number().int().min(50).max(100).optional(),
  stressScore: z.number().int().min(0).max(100).optional(),
  // Night detail (25 Oct 2026): main sleep's bed/wake times, time in bed and minutes per stage.
  sleepStart: z.string().datetime({ offset: true }).optional(),
  sleepEnd: z.string().datetime({ offset: true }).optional(),
  sleepInBedMin: z.number().int().min(0).max(1440).optional(),
  sleepAwakeMin: z.number().int().min(0).max(1440).optional(),
  sleepLightMin: z.number().int().min(0).max(1440).optional(),
  sleepDeepMin: z.number().int().min(0).max(1440).optional(),
  sleepRemMin: z.number().int().min(0).max(1440).optional(),
  // Healthspan (25 Oct 2026): that day's latest blood pressure (mmHg) and VO2max (mL/kg/min).
  systolicBp: z.number().int().min(70).max(260).optional(),
  diastolicBp: z.number().int().min(40).max(160).optional(),
  vo2max: z.number().min(10).max(90).optional(),
  // Smart-scale readings. Only ingested for devices paired with kind "scale".
  weightKg: z.number().positive().max(500).optional(),
  bodyFatPercent: z.number().positive().max(70).optional(),
});

export const syncDeviceSchema = z.object({
  samples: z.array(syncSampleSchema).max(90),
  batteryPct: z.number().int().min(0).max(100).optional(),
  // Client-reported failure (e.g. permission revoked mid-sync).
  error: z.string().trim().max(300).optional(),
});
export type SyncDeviceInput = z.infer<typeof syncDeviceSchema>;
