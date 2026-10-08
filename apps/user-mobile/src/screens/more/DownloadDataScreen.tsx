import React, { useState } from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { UserDataExportMeta } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { fetchLatestExport, requestExport } from "../../api/dataExports";
import { downloadDataExport } from "../../lib/downloadExport";
import { extractErrorMessage } from "../../lib/apiError";
import { BRAND_NAME } from "../../lib/brand";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "DownloadData">;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatReady(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${date}, ${time}`;
}

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md }}>
      <Text style={{ flex: 1, color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 12 }}>{value}</Text>
    </View>
  );
}

function Tag({ label, tone }: { label: string; tone: "success" | "warning" | "neutral" }) {
  const palette = {
    success: { bg: colors.successSoft, fg: colors.success },
    warning: { bg: colors.warningSoft, fg: colors.warning },
    neutral: { bg: colors.surfaceHigh, fg: colors.textSecondary },
  }[tone];
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: palette.bg, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 }}>
      <Text style={{ color: palette.fg, fontFamily: fonts.bodyBold, fontSize: 10 }}>{label}</Text>
    </View>
  );
}

/**
 * Figma Settings 16 - Download my data. Backed by POST /users/me/exports (builds
 * a real ZIP: summary PDF + CSV files, kept 7 days), GET /users/me/exports/latest
 * and the owner-only download. Native saves via the share sheet; web downloads
 * through the browser.
 */
export function DownloadDataScreen(_props: Props) {
  const queryClient = useQueryClient();
  const [downloading, setDownloading] = useState(false);
  const { data: exp, isLoading, isError, refetch } = useQuery({ queryKey: ["users", "exports", "latest"], queryFn: fetchLatestExport });

  const request = useMutation({
    mutationFn: requestExport,
    onSuccess: (meta) => queryClient.setQueryData<UserDataExportMeta | null>(["users", "exports", "latest"], meta),
    onError: (err) => Alert.alert("Couldn't prepare your data", extractErrorMessage(err, "Try again in a moment.")),
  });

  const onDownload = async (meta: UserDataExportMeta) => {
    setDownloading(true);
    try {
      const ok = await downloadDataExport(meta.id, `fynrox-data-${meta.createdAt.slice(0, 10)}.zip`);
      if (!ok) Alert.alert("Can't open the share sheet", "Sharing isn't available on this device.");
    } catch (err) {
      const expired = (err as { response?: { status?: number } }).response?.status === 410;
      Alert.alert(expired ? "This export has expired" : "Couldn't download", expired ? "Request a new export to get a fresh copy." : extractErrorMessage(err, "Try again."));
      if (expired) refetch();
    } finally {
      setDownloading(false);
    }
  };

  const ready = exp && exp.status === "ready" ? exp : null;
  const expired = exp && exp.status === "expired";

  return (
    <ScreenContainer title="Download my data">
      {isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <>
          <Tag
            label={ready ? `Ready · ${formatReady(ready.createdAt)}` : expired ? "Expired" : "Not requested yet"}
            tone={ready ? "success" : expired ? "warning" : "neutral"}
          />
          <View style={{ gap: 6 }}>
            <Text accessibilityRole="header" style={{ color: colors.textPrimary, ...typography.h1, fontSize: 22 }}>
              {ready ? "Your data is ready" : expired ? "Your last export expired" : "Get a copy of your data"}
            </Text>
            <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 13, lineHeight: 19 }}>
              {ready
                ? `Everything ${BRAND_NAME} holds about you, in files you can open anywhere.`
                : `We'll gather everything ${BRAND_NAME} holds about you into a ZIP of a summary PDF and CSV files you can open anywhere.`}
            </Text>
          </View>

          {ready ? (
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 12 }}>
              {ready.groups.map((g) => (
                <Row key={g.key} label={g.label} value={formatSize(g.size)} />
              ))}
              <Row label="Link expires" value={formatExpiry(ready.expiresAt)} />
            </View>
          ) : null}

          <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md }}>
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 17 }}>
              Only you can download this. Professionals, gyms and partners never get a copy.
            </Text>
          </View>

          {ready ? (
            <Button label={`Download all (ZIP, ${formatSize(ready.zipSize)})`} onPress={() => onDownload(ready)} loading={downloading} />
          ) : null}
          <Button
            label={request.isPending ? "Preparing your files..." : ready ? "Request a new export" : "Request export"}
            variant={ready ? "secondary" : "primary"}
            onPress={() => request.mutate()}
            loading={request.isPending}
          />
        </>
      )}
    </ScreenContainer>
  );
}
