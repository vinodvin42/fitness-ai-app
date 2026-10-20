import React from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { RelationshipStatus, RelationshipStatusItem } from "@fitness-ai-app/types";
import { Card } from "./Card";
import { Button } from "./Button";
import { Pill } from "./Pill";
import { fetchRelationshipStatus } from "../api/coaching";
import { colors, spacing, typography } from "../theme/tokens";

// Statuses where a nutrition request is still on its way to Active. `active` and the finished
// outcomes (declined, expired, completed) are left to the coaching hub, so Food only shows a
// request that is still in progress.
const IN_PROGRESS: ReadonlySet<RelationshipStatus> = new Set([
  "requested",
  "offered",
  "accepted",
  "awaiting_payment",
  "activating",
  "activation_failed",
  "changing",
]);

const NOTE_KEY: Partial<Record<RelationshipStatus, string>> = {
  requested: "coaching.relationship.requestedNote",
  offered: "coaching.relationship.offeredNote",
  activation_failed: "coaching.relationship.activationFailedNote",
  changing: "coaching.relationship.changingNote",
};

const TONE: Partial<Record<RelationshipStatus, "ai" | "warning" | "danger">> = {
  requested: "ai",
  offered: "ai",
  activation_failed: "danger",
};

/** The newest nutrition request that hasn't reached Active yet, if any. */
export function pendingNutritionRequest(rows: RelationshipStatusItem[] | undefined): RelationshipStatusItem | null {
  const pending = (rows ?? []).filter((r) => r.serviceType === "nutrition" && IN_PROGRESS.has(r.status));
  pending.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return pending[0] ?? null;
}

/**
 * Figma Fuel 14 ("nutrition professional pending"): while a nutrition coaching request is in
 * progress, Food says so and links to the request. Uses the same status copy as the coaching hub.
 *
 * Left out on purpose, until the rules exist:
 * - the price line (prices and GST are an open owner decision);
 * - the "2,200 kcal / 140 g" targets (no per-member targets yet);
 * - the 48-hour reply window (no request time limit is enforced).
 *
 * The access line is backed by the API: a professional can read a client's data only while the
 * relationship is `active` (professionalClients.service.ts), and food logs only when the member
 * shares them in Privacy settings.
 */
export function NutritionCoachCard({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ["coaching", "relationships", "status"],
    queryFn: fetchRelationshipStatus,
  });
  const request = pendingNutritionRequest(data?.relationships);
  if (!request) return null;

  const status = request.stuck ? null : request.status;
  const statusLabel = request.stuck
    ? t("coaching.relationship.stuckStatus")
    : t(`coaching.relationship.status.${request.status}`);
  const note = request.stuck
    ? t("coaching.relationship.stuckNote")
    : t(NOTE_KEY[request.status] ?? "coaching.relationship.notActiveNote");
  const firstName = request.professionalFullName.split(" ")[0] || request.professionalFullName;

  return (
    <Card style={{ gap: spacing.sm }}>
      <Pill label={statusLabel} tone={(status && TONE[status]) || "warning"} icon="clock" />
      <View>
        <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{request.professionalFullName}</Text>
        <Text style={{ color: colors.textMuted, ...typography.meta }}>{t("coaching.relationship.serviceNutrition")}</Text>
      </View>
      <Text style={{ color: colors.textSecondary, ...typography.bodySmall }}>{note}</Text>
      <Text style={{ color: colors.textSecondary, ...typography.meta }}>
        Until then, your food plan stays as it is. {firstName} can see your food logs only once coaching is active, and
        only if you share them in Privacy settings.
      </Text>
      <Button label="View request" variant="secondary" onPress={onOpen} />
    </Card>
  );
}
