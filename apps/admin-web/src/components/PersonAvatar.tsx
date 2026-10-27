import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../lib/api";
import { cn } from "../lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";

/**
 * A member's or coach's profile photo, with their initials as the fallback (owner decision,
 * 27 Oct 2026: admins may see profile photos in the console). The lists and detail responses carry
 * `photoUpdatedAt` (null = no photo), so the photo is only fetched for people who have one, and the
 * cache key includes that timestamp so a changed photo is fetched again. `photoUpdatedAt` left
 * undefined means "not known": one fetch is tried and its result (possibly null) is cached.
 */
export type PersonAvatarKind = "user" | "professional";

type PhotoResponse = { photo: { imageData: string; updatedAt: string } | null };

const SIZE_CLASSES = {
  sm: "size-6 text-[10px]",
  md: "size-8 text-xs",
  lg: "size-12 text-base",
  xl: "size-16 text-lg",
} as const;

export function personInitials(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "")).toUpperCase();
}

export function PersonAvatar({
  kind,
  id,
  name,
  photoUpdatedAt,
  size = "md",
  className,
}: {
  kind: PersonAvatarKind;
  id: string | null | undefined;
  name: string | null | undefined;
  photoUpdatedAt: string | null | undefined;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}) {
  const path = kind === "user" ? "users" : "professionals";
  const { data } = useQuery({
    queryKey: ["admin-photo", kind, id, photoUpdatedAt],
    queryFn: async () => (await apiClient.get<PhotoResponse>(`/admin/${path}/${id}/photo`)).data.photo,
    enabled: !!id && photoUpdatedAt !== null,
    staleTime: Infinity,
    retry: false,
  });

  return (
    <Avatar className={cn(SIZE_CLASSES[size], className)}>
      {data?.imageData ? <AvatarImage src={data.imageData} alt="" /> : null}
      <AvatarFallback className="bg-accent/15 font-semibold text-accent">{personInitials(name)}</AvatarFallback>
    </Avatar>
  );
}
