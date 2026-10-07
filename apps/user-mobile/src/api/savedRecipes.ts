import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SavedRecipe } from "@fitness-ai-app/types";
import { apiClient } from "./client";

export const SAVED_RECIPES_KEY = ["saved-recipes"] as const;

export function fetchSavedRecipes() {
  return apiClient.get<{ items: SavedRecipe[] }>("/saved-recipes").then((r) => r.data.items);
}

export function saveRecipe(recipeId: string) {
  return apiClient.post<{ recipeId: string; saved: true }>("/saved-recipes", { recipeId }).then((r) => r.data);
}

export function unsaveRecipe(recipeId: string) {
  return apiClient.delete<{ recipeId: string; saved: false }>(`/saved-recipes/${recipeId}`).then((r) => r.data);
}

/** The user's saved recipes plus a toggle used by the heart buttons on Recipes / Recipe Detail. */
export function useSavedRecipes() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: SAVED_RECIPES_KEY, queryFn: fetchSavedRecipes, staleTime: 60_000 });
  const ids = new Set((query.data ?? []).map((r) => r.id));
  const toggle = useMutation<unknown, Error, { recipeId: string; saved: boolean }>({
    mutationFn: ({ recipeId, saved }: { recipeId: string; saved: boolean }) =>
      saved ? saveRecipe(recipeId) : unsaveRecipe(recipeId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: SAVED_RECIPES_KEY }),
  });
  return {
    ...query,
    isSaved: (recipeId: string) => ids.has(recipeId),
    toggle: (recipeId: string) => toggle.mutate({ recipeId, saved: !ids.has(recipeId) }),
    isToggling: toggle.isPending,
    toggleError: toggle.error,
  };
}
