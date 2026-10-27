import { useTranslation } from "react-i18next";
import { Check, Mail } from "lucide-react";
import { Page, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";

const SUPPORT_MAILTO = "mailto:support@fynrox.com";

/**
 * Help & support: the old app's More > Help & support (it opened a mail to
 * support@fynrox.com and showed this note) as its own page.
 */
export function HelpScreen() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const tips = [t("web.settings.help.includeAccount"), t("web.settings.help.includeWho"), t("web.settings.help.includeScreenshot")];

  return (
    <Page width="narrow">
      <PageHeader
        title={t("more.help.title")}
        description={t("web.settings.help.description")}
        back={isMobile ? { to: "/more", label: t("web.nav.more") } : undefined}
      />

      <Card>
        <CardHeader>
          <span className="mb-1 flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary-ink">
            <Mail className="size-5" />
          </span>
          <CardTitle className="font-semibold">{t("web.settings.help.address")}</CardTitle>
          <CardDescription>{t("more.help.message")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button size="lg" className="h-10 w-full sm:w-auto sm:px-5" render={<a href={SUPPORT_MAILTO} />}>
            <Mail />
            {t("web.settings.help.emailButton")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-semibold">{t("web.settings.help.includeTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2.5 text-sm">
            {tips.map((tip) => (
              <li key={tip} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary-ink">
                  <Check className="size-3" strokeWidth={3} />
                </span>
                {tip}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </Page>
  );
}
