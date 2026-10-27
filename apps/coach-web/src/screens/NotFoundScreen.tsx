import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Compass } from "lucide-react";
import { EmptyState, Page } from "@/components/page";
import { Button } from "@/components/ui/button";

export function NotFoundScreen() {
  const { t } = useTranslation();
  return (
    <Page width="narrow" className="pt-16">
      <EmptyState
        icon={Compass}
        title={t("web.notFoundTitle")}
        description={t("web.notFoundBody")}
        action={<Button render={<Link to="/" />}>{t("web.goToday")}</Button>}
      />
    </Page>
  );
}
