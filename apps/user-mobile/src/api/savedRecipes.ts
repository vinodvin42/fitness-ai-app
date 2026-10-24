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

/** Figma fuel/17 "How was it?" (24 Oct 2026): 1 Not for me, 2 Okay, 3 Good, 4 Loved it; private to the member. */
export function fetchRecipeRating(recipeId: string) {
  return apiClient.get<{ recipeId: string; rating: number | null }>(`/recipes/${recipeId}/rating`).then((r) => r.data.rating);
}

export function setRecipeRating(recipeId: string, rating: number | null) {
  return (
    rating == null
      ? apiClient.delete<{ recipeId: string; rating: null }>(`/recipes/${recipeId}/rating`)
      : apiClient.put<{ recipeId: string; rating: number }>(`/recipes/${recipeId}/rating`, { rating })
  ).then((r) => r.data.rating);
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
