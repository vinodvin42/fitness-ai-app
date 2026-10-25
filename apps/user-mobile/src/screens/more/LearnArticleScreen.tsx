import React from "react";
import { ActivityIndicator, Image, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { ErrorState } from "../../components/ErrorState";
import { Icon } from "../../components/Icon";
import { fetchLearnArticle } from "../../api/learn";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";
import { TOPIC_LABEL } from "./LearnScreen";

type Props = NativeStackScreenProps<MoreStackParamList, "LearnArticle">;

const AUDIENCE_LABEL = { everyone: "For everyone", beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" } as const;

/** The article body format: blank-line paragraphs, "## " headings, "- " bullets (see apps/api's Article). */
function ArticleBody({ body }: { body: string }) {
  const blocks = body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <View style={{ gap: spacing.md }}>
      {blocks.map((block, i) => {
        if (block.startsWith("## ")) {
          return (
            <Text key={i} accessibilityRole="header" style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 18, lineHeight: 24 }}>
              {block.slice(3)}
            </Text>
          );
        }
        const lines = block.split("\n");
        if (lines.every((l) => l.trim().startsWith("- "))) {
          return (
            <View key={i} style={{ gap: 6 }}>
              {lines.map((l, j) => (
                <View key={j} style={{ flexDirection: "row", gap: spacing.sm }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 15, lineHeight: 23 }}>•</Text>
                  <Text style={{ flex: 1, color: colors.textPrimary, fontFamily: fonts.body, fontSize: 15, lineHeight: 23 }}>{l.trim().slice(2)}</Text>
                </View>
              ))}
            </View>
          );
        }
        return (
          <Text key={i} style={{ color: colors.textPrimary, fontFamily: fonts.body, fontSize: 15, lineHeight: 23 }}>
            {block}
          </Text>
        );
      })}
    </View>
  );
}

/**
 * One Learn article (05.04 Educational Content, Oct 2026) —
 * GET /learn/articles/:slug, which also counts the view. Shows who reviewed
 * it and when; every published article has an expert reviewer.
 */
export function LearnArticleScreen({ navigation, route }: Props) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["learn", "article", route.params.slug],
    queryFn: () => fetchLearnArticle(route.params.slug),
  });

  return (
    <ScreenContainer title={data?.title ?? "Article"} eyebrow={data ? TOPIC_LABEL[data.topic] : undefined} onBack={() => navigation.goBack()}>
      {isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : isError || !data ? (
        <ErrorState message="Couldn't load this article." onRetry={() => refetch()} />
      ) : (
        <>
          <Text style={{ color: colors.textMuted, ...typography.meta }}>
            {data.readMinutes} min read · {AUDIENCE_LABEL[data.audience]}
          </Text>
          {data.reviewedBy ? (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}
              accessible
              accessibilityLabel={`Reviewed by ${data.reviewedBy.name}${data.reviewedBy.credentials ? `, ${data.reviewedBy.credentials}` : ""}, on ${new Date(data.reviewedBy.reviewedAt).toLocaleDateString()}`}
            >
              <Icon name="shield-check" size={14} color={colors.success} />
              <Text style={{ flex: 1, color: colors.textSecondary, ...typography.meta }}>
                Reviewed by {data.reviewedBy.name}
                {data.reviewedBy.credentials ? `, ${data.reviewedBy.credentials}` : ""} · {new Date(data.reviewedBy.reviewedAt).toLocaleDateString()}
              </Text>
            </View>
          ) : null}
          {data.coverImageUrl ? (
            <Image
              source={{ uri: data.coverImageUrl }}
              style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: radius.md }}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
          ) : null}
          <ArticleBody body={data.body} />
          <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.md }}>
            General information, not medical advice. Talk to your doctor before making big changes, especially with a health condition.
          </Text>
        </>
      )}
    </ScreenContainer>
  );
}
