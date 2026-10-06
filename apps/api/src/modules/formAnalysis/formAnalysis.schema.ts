import { z } from "zod";

// Train 18 — capture only. videoUrl is a stored https URL or a small
// `data:video/...` ref (express.json caps the whole body at 10mb).
const videoRef = z
  .string()
  .max(8_000_000)
  .refine((v) => /^https?:\/\/\S{1,2000}$/.test(v) || /^data:video\/[a-z0-9.+-]+;base64,/i.test(v), {
    message: "videoUrl must be an http(s) URL or a data:video/* base64 reference",
  });

export const createFormAnalysisSchema = z.object({
  exerciseId: z.string().min(1).max(191).optional(),
  videoUrl: videoRef,
});
export type CreateFormAnalysisInput = z.infer<typeof createFormAnalysisSchema>;

export const reviewFormAnalysisSchema = z.object({
  coachNote: z.string().trim().min(1).max(2000),
});
