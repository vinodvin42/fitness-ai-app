import React, { useState } from "react";
import { Alert, Platform, Text, View } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { SkeletonCard } from "../../components/Skeleton";
import { fetchJourneyReport } from "../../api/timeline";
import { BRAND_NAME } from "../../lib/brand";
import { fmtDate, reportHtml, reportShareText, shareText } from "../../lib/timelineFormat";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "TimelineReport">;

function Mark({ evidence }: { evidence: "measured" | "estimated" }) {
  return (
    <Text style={{ color: evidence === "measured" ? colors.success : colors.warning, fontWeight: "700" }}>
      {evidence === "measured" ? "✓ " : "~ "}
    </Text>
  );
}

/**
 * Export the report as a real PDF. Native: render the HTML with expo-print and
 * hand the file to the share sheet (expo-sharing). Web: open the same printable
 * HTML in a new tab and call print() (the browser's "Save as PDF"), falling
 * back to downloading the HTML file when pop-ups are blocked.
 */
async function exportPdf(html: string): Promise<void> {
  if (Platform.OS === "web") {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (w) {
      w.addEventListener("load", () => w.print());
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = "journey-report.html";
    a.click();
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: "Journey Report" });
  } else {
    Alert.alert("PDF saved", `Your report was saved to ${uri}`);
  }
}

/**
 * Journey Report (Figma Progress 11), composed server-side from the user's
 * real logs (GET /timeline/report). Every line is tagged Measured (typed in or
 * device-synced) or Estimated (derived). Sections with no data say what to log.
 */
export function TimelineReportScreen({ navigation }: Props) {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["timeline", "report"], queryFn: fetchJourneyReport });
  const [exporting, setExporting] = useState(false);

  const onExport = async () => {
    if (!data) return;
    setExporting(true);
    try {
      await exportPdf(reportHtml(data));
    } catch {
      Alert.alert("Couldn't export PDF", "Try again, or use Share Report to send the summary as text.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <ScreenContainer title="Journey Report" eyebrow={BRAND_NAME} subtitle="Longitudinal Health Legacy Analysis">
      <BackButton onPress={() => navigation.goBack()} />
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <SkeletonCard lines={5} />
      ) : (
        <>
          <View style={{ gap: 2 }}>
            <Text style={{ color: colors.textMuted, ...typography.meta }}>Generated {fmtDate(data.generatedAt)}</Text>
            <Text style={{ color: colors.textMuted, ...typography.meta }}>
              Period: {fmtDate(data.periodStart)} - {fmtDate(data.periodEnd)}
            </Text>
          </View>

          <Card style={{ gap: 4, borderColor: colors.accent, backgroundColor: colors.accentSoft }}>
            <Text style={{ color: colors.accent, ...typography.caption, letterSpacing: 0.6 }}>Executive Summary</Text>
            <Text style={{ color: colors.textPrimary, ...typography.label, fontSize: 14 }}>{data.summaryTitle}</Text>
          </Card>

          {data.sections.map((s, i) => (
            <Card key={s.id} style={{ gap: spacing.xs, paddingVertical: spacing.sm }}>
              <Text style={{ color: colors.textSecondary, ...typography.caption }}>
                Section {i + 1} — {s.title}
              </Text>
              {s.lines.length === 0 ? (
                <Text style={{ color: colors.textMuted, ...typography.meta }}>{s.emptyNote}</Text>
              ) : (
                s.lines.map((l, j) => (
                  <Text key={j} style={{ color: colors.textPrimary, ...typography.meta, fontSize: 13, lineHeight: 19 }}>
                    <Mark evidence={l.evidence} />
                    {l.text}
                  </Text>
                ))
              )}
            </Card>
          ))}

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Text style={{ color: colors.success, backgroundColor: colors.successSoft, ...typography.caption, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.xs, overflow: "hidden" }}>
              ✓ Measured
            </Text>
            <Text style={{ color: colors.warning, backgroundColor: colors.warningSoft, ...typography.caption, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.xs, overflow: "hidden" }}>
              ~ Estimated
            </Text>
          </View>
          <Text style={{ color: colors.textMuted, ...typography.meta, lineHeight: 16 }}>
            Measured = entered by you or synced from a device. Estimated = derived from your logs. {data.disclaimer}
          </Text>

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button label="Share Report" onPress={() => void shareText(reportShareText(data))} style={{ flex: 1 }} />
            <Button label="Export PDF" variant="secondary" onPress={onExport} loading={exporting} style={{ flex: 1 }} />
          </View>
        </>
      )}
    </ScreenContainer>
  );
}
