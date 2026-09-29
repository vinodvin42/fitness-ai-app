import React from "react";
import { useTranslation } from "react-i18next";
import { ScreenContainer } from "../../components/ScreenContainer";
import { EmptyState } from "../../components/EmptyState";

/** Honest "not built yet" screen — see MainTabs.tsx's doc comment for which tabs use this and why. */
export function ComingSoonScreen({ title, subtitle }: { title: string; subtitle: string }) {
  const { t } = useTranslation();
  return (
    <ScreenContainer title={title}>
      <EmptyState title={t("common.comingSoon")} subtitle={subtitle} />
    </ScreenContainer>
  );
}
