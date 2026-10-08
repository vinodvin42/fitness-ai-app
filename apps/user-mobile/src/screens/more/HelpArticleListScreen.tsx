import React from "react";
import { ActivityIndicator, Pressable, Text } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { GroupCard } from "../../components/SettingsParts";
import { fetchHelpArticles } from "../../api/help";
import { colors, fonts, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "HelpArticleList">;

/** Articles in one Help & Support category (Figma Settings 13 FAQ Categories). */
export function HelpArticleListScreen({ navigation, route }: Props) {
  const { category, title } = route.params;
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["help", "articles", category],
    queryFn: () => fetchHelpArticles({ category }),
  });

  return (
    <ScreenContainer title={title}>
      <BackButton onPress={() => navigation.goBack()} />
      {isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState title="No articles yet" subtitle="Open a ticket from Help & Support if you need a hand." />
      ) : (
        <GroupCard>
          {(data ?? []).map((a) => (
            <Pressable
              key={a.slug}
              onPress={() => navigation.navigate("HelpArticle", { slug: a.slug })}
              accessibilityRole="button"
              style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: 14 }}
            >
              <Text style={{ flex: 1, color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 14 }}>{a.title}</Text>
              <Icon name="chevron-right" size={16} color={colors.textMuted} />
            </Pressable>
          ))}
        </GroupCard>
      )}
      <Text style={{ color: colors.textMuted, ...typography.meta }}>Articles describe how Fynrox works today.</Text>
    </ScreenContainer>
  );
}
