import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { AuthHeading, AuthLayout, Field, PasswordField } from "./AuthLayout";

/** Coach login: email and password. The router moves on to onboarding or Today once signed in. */
export function LoginScreen() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password || loading) return;
    setError(null);
    setLoading(true);
    try {
      await login({ email: email.trim(), password });
    } catch {
      setError(t("web.auth.loginFailed"));
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <AuthHeading title={t("auth.login.title")} subtitle={t("auth.login.subtitle")} />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field id="email" label={t("auth.login.email")}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11"
            autoFocus
          />
        </Field>
        <PasswordField id="password" label={t("auth.login.password")} value={password} onChange={setPassword} autoComplete="current-password" />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" className="h-11 w-full text-[15px] font-semibold" disabled={!email || !password || loading}>
          {loading ? <Loader2 className="animate-spin" /> : null}
          {t("auth.login.submit")}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        {t("auth.login.newHere")}{" "}
        <Link to="/signup" className="font-semibold text-primary-ink hover:underline">
          {t("auth.login.createAccount")}
        </Link>
      </p>
      <p className="border-t pt-5 text-center text-xs text-muted-foreground">{t("auth.layout.reviewNote")}</p>
    </AuthLayout>
  );
}
