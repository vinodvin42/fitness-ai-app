import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { AuthHeading, AuthLayout, Field, PasswordField } from "./AuthLayout";

/** Coach sign-up. A new account always goes to onboarding next. */
export function SignupScreen() {
  const { t } = useTranslation();
  const { signup } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = !!fullName.trim() && !!email.trim() && !!password && !!confirmPassword;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || loading) return;
    if (password.length < 8) return setError(t("web.auth.passwordTooShort"));
    if (password !== confirmPassword) return setError(t("web.auth.passwordsMismatch"));
    setError(null);
    setLoading(true);
    try {
      await signup({ fullName: fullName.trim(), email: email.trim(), password, phone: phone.trim() || undefined });
    } catch {
      setError(t("web.auth.signupFailed"));
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <Link to="/login" className="-mb-2 inline-flex items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" />
        {t("common.back")}
      </Link>
      <AuthHeading title={t("auth.signup.title")} subtitle={t("auth.signup.subtitle")} />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field id="fullName" label={t("auth.signup.fullName")}>
          <Input id="fullName" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-11" autoFocus />
        </Field>
        <Field id="email" label={t("auth.signup.email")}>
          <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
        </Field>
        <Field id="phone" label={t("auth.signup.phone")}>
          <Input id="phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11" />
        </Field>
        <PasswordField id="password" label={t("auth.signup.password")} value={password} onChange={setPassword} autoComplete="new-password" />
        <PasswordField id="confirmPassword" label={t("auth.signup.confirmPassword")} value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" className="h-11 w-full text-[15px] font-semibold" disabled={!canSubmit || loading}>
          {loading ? <Loader2 className="animate-spin" /> : null}
          {t("auth.signup.submit")}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        {t("auth.signup.haveAccount")}{" "}
        <Link to="/login" className="font-semibold text-primary-ink hover:underline">
          {t("auth.signup.logIn")}
        </Link>
      </p>
      <p className="border-t pt-5 text-center text-xs text-muted-foreground">{t("auth.layout.reviewNote")}</p>
    </AuthLayout>
  );
}
