import React from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { AIBanner } from "../../components/AIBanner";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { RecoverStackParamList } from "../../navigation/RecoverStack";

type Props = NativeStackScreenProps<RecoverStackParamList, "RecoverHub">;

/**
 * Recover — docs/mobile/03-screen-inventory.md §E (5 screens) + §H (AI
 * Coach, 1 screen) — both live in this one tab per docs/platform/roadmap.md's
 * Phase 2 grouping. Split honestly in two:
 *   - **Recovery & Devices** (31 Aug 2026) is now a real manual-entry log —
 *     resting HR / sleep / HRV / soreness / energy the user enters
 *     themselves, with real 30-day averages and history (see
 *     RecoveryScreen.tsx + apps/api's recovery module). Automatic wearable
 *     pairing (Bluetooth/HealthKit/Google Fit) still needs native
 *     integration with no honest data source in this build (gap §13), so
 *     it stays out — but the self-reported stopgap is real data, not a
 *     faked device feed, same precedent as Progress Photos' base64 storage.
 *   - **AI Coach** (25 Aug 2026) is real — apps/api/src/modules/aiCoach
 *     now has genuine conversation persistence, prompt design, rate
 *     limiting, and cost controls behind it (closing gap §13's other
 *     half), so this card is a real entry point, not a placeholder. See
 *     AiCoachScreen.tsx's own doc comment for what's still deferred
 *     (streaming responses) and why this ships as a Recover-tab screen
 *     rather than the design's global floating action button.
 */
export function RecoverScreen({ navigation }: Props) {
  const { t } = useTranslation();
  return (
    <ScreenContainer title={t("recoverHub.title")} subtitle={t("recoverHub.subtitle")}>
      <AIBanner
        title={t("recoverHub.chat")}
        body="Training, nutrition, and recovery guidance grounded in your real goals and progress."
        ctaLabel="Open chat"
        onPress={() => navigation.navigate("AiCoach")}
      />

      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: radius.md,
              backgroundColor: colors.dangerSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="heart-pulse" size={24} color={colors.danger} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{t("recoverHub.log")}</Text>
            <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: 2 }}>
              {t("recoverHub.logSubtitle")}
            </Text>
          </View>
        </View>
        <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.md }}>
          Self-reported, with 30-day averages and history. Automatic wearable sync (HealthKit/Google Fit) needs a
          native integration this build can't do yet.
        </Text>
        <Button
          label={t("recoverHub.open")}
          variant="secondary"
          onPress={() => navigation.navigate("Recovery")}
          style={{ marginTop: spacing.md }}
        />
      </Card>
    </ScreenContainer>
  );
}
