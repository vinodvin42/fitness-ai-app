import { useMutation, useQueryClient } from "@tanstack/react-query";
import { logMindfulness } from "../api/progress";

/**
 * Posts a finished guided session to the existing POST /mindfulness-logs.
 * That endpoint only stores { durationMinutes, type, note }, so a yoga /
 * mobility / breathing session is logged with the closest fields: whole
 * minutes (min 1), `type` = the practice kind and `note` = the routine name.
 */
export function useLogMindfulness() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { seconds: number; type: string; note: string }) =>
      logMindfulness({
        durationMinutes: Math.max(1, Math.round(v.seconds / 60)),
        type: v.type,
        note: v.note.slice(0, 200),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["progress", "mindfulness-logs", "today"] });
      queryClient.invalidateQueries({ queryKey: ["progress", "streaks"] });
    },
  });
}
