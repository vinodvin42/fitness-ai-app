import { z } from "zod";

export const notificationKindSchema = z.enum(["reminder", "workout", "nutrition", "coach", "billing", "system"]);

export const listNotificationsQuerySchema = z.object({
  cursor: z.string().min(1).max(191).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  filter: z.enum(["all", "unread"]).default("all"),
  // Figma Today 02 pills: Workouts -> kind "workout", Nutrition -> kind "nutrition".
  category: z.enum(["workouts", "nutrition"]).optional(),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

export const registerPushTokenSchema = z.object({
  token: z.string().min(1).max(512),
  platform: z.enum(["ios", "android", "web"]),
});
export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;

export const removePushTokenSchema = z.object({
  token: z.string().min(1).max(512),
});
export type RemovePushTokenInput = z.infer<typeof removePushTokenSchema>;
