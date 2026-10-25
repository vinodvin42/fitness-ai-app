import React, { useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ArticleTopic, LearnArticleSummary } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Chip } from "../../components/Chip";
import { ErrorState } from "../../components/ErrorState";
import { Icon, IconName } from "../../components/Icon";
import { fetchLearnArticles } from "../../api/learn";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "Learn">;

export const TOPIC_LABEL: Record<ArticleTopic, string> = {
  training: "Training",
  nutrition: "Nutrition",
  recovery: "Recovery",
  sleep: "Sleep",
  mindset: "Mindset",
};

export const TOPIC_ICON: Record<ArticleTopic, IconName> = {
  training: "dumbbell",
  nutrition: "utensils",
  recovery: "heart-pulse",
  sleep: "moon",
  mindset: "brain",
};

function ArticleCard({ article, onPress }: { article: LearnArticleSummary; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${article.title}. ${TOPIC_LABEL[article.topic]}, ${article.readMinutes} minute read.`}
      style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}
    >
      {article.coverImageUrl ? (
        <Image source={{ uri: article.coverImageUrl }} style={{ width: "100%", aspectRatio: 16 / 9 }} resizeMode="cover" accessibilityIgnoresInvertColors />
      ) : null}
      <View style={{ padding: spacing.md, gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon name={TOPIC_ICON[article.topic]} size={14} color={colors.accentText} />
          <Text style={{ color: colors.accentText, ...typography.meta }}>
            {TOPIC_LABEL[article.topic]} · {article.readMinutes} min read
          </Text>
        </View>
        <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 22 }}>{article.title}</Text>
        <Text style={{ color: colors.textSecondary, ...typography.meta, lineHeight: 19 }} numberOfLines={3}>
          {article.summary}
        </Text>
        {article.reviewedBy ? (
          <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 12 }}>
            Reviewed by {article.reviewedBy.name}
            {article.reviewedBy.credentials ? `, ${article.reviewedBy.credentials}` : ""}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * Learn (05.04 Educational Content, Oct 2026): short, expert-reviewed
 * articles on training, nutrition, recovery, sleep and mindset
 * (GET /learn/articles). The More menu shows the entry only once at least one
 * article is published; topic chips list only topics that have articles.
 */
export function LearnScreen({ navigation, route }: Props) {
  const [topic, setTopic] = useState<ArticleTopic | undefined>(route.params?.topic);
  const all = useQuery({ queryKey: ["learn", "articles", "all"], queryFn: () => fetchLearnArticles() });
  const filtered = useQuery({
    queryKey: ["learn", "articles", topic],
    queryFn: () => fetchLearnArticles(topic),
    enabled: topic !== undefined,
  });
  const data = topic ? filtered : all;
  const topics = all.data?.topics ?? [];

  return (
    <ScreenContainer title="Learn" subtitle="Short reads, checked by experts" onBack={() => navigation.goBack()}>
      {topics.length > 1 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
          <Chip label="All" selected={topic === undefined} onPress={() => setTopic(undefined)} />
          {topics.map((t) => (
            <Chip key={t.topic} label={TOPIC_LABEL[t.topic]} selected={topic === t.topic} onPress={() => setTopic(t.topic)} />
          ))}
        </View>
      ) : null}

      {data.isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : data.isError ? (
        <ErrorState message="Couldn't load articles." onRetry={() => data.refetch()} />
      ) : (data.data?.articles ?? []).length === 0 ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
          <Text style={{ color: colors.textSecondary, ...typography.meta }}>No articles here yet. Check back soon.</Text>
        </View>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {(data.data?.articles ?? []).map((a) => (
            <ArticleCard key={a.slug} article={a} onPress={() => navigation.navigate("LearnArticle", { slug: a.slug })} />
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}
