import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { useToast } from "./Toast";
import { setOfflineSetsUser, setRejectedNotifier, startOfflineSets } from "../lib/offlineSets";

/**
 * Offline set logging (Figma today/08, 24 Oct 2026): mounted once in App.tsx. Starts the queue on this phone
 * (lib/offlineSets.ts), sends it under the signed-in member when the connection is back, and says so when the
 * server refuses a set (its workout was closed elsewhere). Renders nothing.
 */
export function OfflineSetSync() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  useEffect(() => startOfflineSets(queryClient), [queryClient]);
  useEffect(() => setOfflineSetsUser(user?.id ?? null), [user?.id]);
  useEffect(() => {
    setRejectedNotifier((rejected) =>
      toast.show(
        `${rejected.length === 1 ? "1 set" : `${rejected.length} sets`} saved on this phone couldn't be added: ${
          rejected.every((r) => r.reason === "closed") ? "that workout was already finished or discarded" : "the server didn't accept them"
        }.`,
        "error",
      ),
    );
    return () => setRejectedNotifier(null);
  }, [toast]);
  return null;
}
