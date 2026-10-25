import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Avatar } from "./Avatar";
import { fetchCoachPhoto } from "../api/coaching";

/**
 * A professional's photo when they've set one (25 Oct 2026), otherwise their initials. `photoVersion`
 * comes with the profile or list row (null = no photo, so nothing is fetched); a new version re-reads
 * it. Photos stay in memory only: the "coaching" queries are never persisted to the device.
 */
export function ProfessionalAvatar({
  professionalId,
  name,
  photoVersion,
  size = 40,
}: {
  professionalId: string;
  name: string;
  photoVersion: string | null | undefined;
  size?: number;
}) {
  const photo = useQuery({
    queryKey: ["coaching", "professionalPhoto", professionalId, photoVersion],
    queryFn: () => fetchCoachPhoto(professionalId),
    enabled: !!photoVersion,
    staleTime: Infinity,
  });
  return <Avatar name={name} uri={photoVersion ? photo.data?.imageData ?? null : null} size={size} />;
}
