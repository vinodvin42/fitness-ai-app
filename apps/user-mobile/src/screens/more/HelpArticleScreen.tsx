import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { fetchHelpArticle } from "../../api/help";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "HelpArticle">;

/** A single help article (GET /help/articles/:slug) with a way out to a ticket if it did not answer the question. */
export function HelpArticleScreen({ navigation, route }: Props) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["help", "article", route.params.slug],
    queryFn: () => fetchHelpArticle(route.params.slug),
  });

  return (
    <ScreenContainer title={data?.title ?? "Help article"} eyebrow={data?.categoryLabel}>
      <BackButton onPress={() => navigation.goBack()} />
      {isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : isError || !data ? (
        <ErrorState message="Couldn't load this article." onRetry={() => refetch()} />
      ) : (
        <>
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.body, fontSize: 15, lineHeight: 23 }}>{data.body}</Text>
          </View>
          <Text style={{ color: colors.textMuted, ...typography.meta }}>
            Updated {new Date(data.updatedAt).toLocaleDateString()}
          </Text>
          <Text style={{ color: colors.textSecondary, ...typography.body }}>Still stuck?</Text>
          <Button label="Open a ticket" variant="secondary" onPress={() => navigation.navigate("SupportTicketForm")} />
        </>
      )}
    </ScreenContainer>
  );
}
