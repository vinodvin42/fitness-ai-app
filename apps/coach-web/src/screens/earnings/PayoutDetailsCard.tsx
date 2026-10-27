import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock, Landmark, Loader2, Pencil, Plus } from "lucide-react";
import type { PayoutAccountMethod, PayoutAccountResponse, PayoutAccountView, SavePayoutAccountInput } from "@fitness-ai-app/types";
import { savePayoutAccount } from "@/api/payoutAccount";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { extractErrorMessage } from "@/lib/apiError";

/** The query key the Earnings screen reads payout details under. */
export const PAYOUT_ACCOUNT_QUERY_KEY = ["professionalPayoutAccount"] as const;

// Same rules as apps/api's professionalPayoutAccount.schema.ts, checked here
// first so a typo is caught before it leaves the browser.
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_NUMBER_REGEX = /^\d{9,18}$/;
const UPI_ID_REGEX = /^[a-z0-9._-]{2,256}@[a-z][a-z0-9]{1,63}$/;

/**
 * Coach payout details (27 Oct 2026). Replaces "email your bank details to
 * support": the coach adds a bank account or UPI ID here, it's stored
 * encrypted and only ever shown masked, and Fynrox verifies it before paying.
 */
export function PayoutDetailsCard({ data }: { data: PayoutAccountResponse }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const account = data.account;

  return (
    <Card className="self-start">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-semibold">
          <Landmark className="size-4 text-primary-ink" />
          {t("web.business.payout.title")}
        </CardTitle>
        <CardDescription>{t("web.business.payout.intro")}</CardDescription>
        {account ? (
          <CardAction>
            <StatusBadge status={account.status} />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {account ? <MaskedDetails account={account} /> : <p className="text-sm text-muted-foreground">{t("web.business.payout.emptyBody")}</p>}

        {account ? <StatusNote account={account} /> : null}

        {data.editable ? (
          <Button
            variant={account ? "outline" : "default"}
            className="h-10 w-full sm:h-8 sm:w-auto"
            onClick={() => setOpen(true)}
          >
            {account ? <Pencil /> : <Plus />}
            {account ? t("web.business.payout.edit") : t("web.business.payout.add")}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">{t("web.business.payout.unavailable")}</p>
        )}
      </CardContent>
      <PayoutDetailsDialog open={open} account={account} onClose={() => setOpen(false)} />
    </Card>
  );
}

function MaskedDetails({ account }: { account: PayoutAccountView }) {
  const { t } = useTranslation();
  const rows: { label: string; value: string }[] = [
    { label: t("web.business.payout.method"), value: account.method === "bank" ? t("web.business.payout.methodBank") : t("web.business.payout.methodUpi") },
    { label: t("web.business.payout.holder"), value: account.accountHolderName },
    {
      label: account.method === "bank" ? t("web.business.payout.accountNumber") : t("web.business.payout.upiId"),
      value: account.maskedDisplay,
    },
  ];
  if (account.method === "bank" && account.ifsc) rows.push({ label: t("web.business.payout.ifsc"), value: account.ifsc });

  return (
    <dl className="divide-y rounded-lg border">
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-3 px-3 py-2.5 text-sm">
          <dt className="text-muted-foreground">{r.label}</dt>
          <dd className="min-w-0 truncate text-right font-medium tabular-nums">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function StatusNote({ account }: { account: PayoutAccountView }) {
  const { t } = useTranslation();
  if (account.status === "verified") {
    return (
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <CheckCircle2 className="mt-px size-3.5 shrink-0 text-success" />
        {t("web.business.payout.verifiedNote")}
      </p>
    );
  }
  if (account.status === "rejected") {
    return (
      <div role="alert" className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="space-y-1">
          <p className="font-medium text-destructive">{t("web.business.payout.rejectedNote")}</p>
          {account.adminNotes ? <p className="text-muted-foreground">{t("web.business.payout.rejectedReason", { notes: account.adminNotes })}</p> : null}
        </div>
      </div>
    );
  }
  return (
    <p className="flex items-start gap-2 text-xs text-muted-foreground">
      <Clock className="mt-px size-3.5 shrink-0 text-warning" />
      {t("web.business.payout.pendingNote")}
    </p>
  );
}

type Errors = Partial<Record<"holder" | "accountNumber" | "confirm" | "ifsc" | "upiId", string>>;

function PayoutDetailsDialog({ open, account, onClose }: { open: boolean; account: PayoutAccountView | null; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<PayoutAccountMethod>("bank");
  const [holder, setHolder] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [upiId, setUpiId] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  // Start from what's saved (the masked parts only), every time it opens.
  useEffect(() => {
    if (!open) return;
    setMethod(account?.method ?? "bank");
    setHolder(account?.accountHolderName ?? "");
    setAccountNumber("");
    setConfirm("");
    setIfsc(account?.ifsc ?? "");
    setUpiId("");
    setErrors({});
  }, [open, account]);

  const mutation = useMutation({
    mutationFn: (input: SavePayoutAccountInput) => savePayoutAccount(input),
    onSuccess: (result) => {
      queryClient.setQueryData(PAYOUT_ACCOUNT_QUERY_KEY, result);
      void queryClient.invalidateQueries({ queryKey: PAYOUT_ACCOUNT_QUERY_KEY });
      toast.success(t("web.business.payout.saved"), { description: t("web.business.payout.savedBody") });
      onClose();
    },
    onError: (err) => {
      toast.error(t("web.business.payout.saveFailed"), { description: extractErrorMessage(err, t("web.business.payout.tryAgain")) });
    },
  });

  function validate(): SavePayoutAccountInput | null {
    const next: Errors = {};
    const name = holder.trim();
    if (name.length < 2) next.holder = t("web.business.payout.errorHolder");
    if (method === "bank") {
      const number = accountNumber.replace(/[\s-]/g, "");
      const code = ifsc.trim().toUpperCase();
      if (!ACCOUNT_NUMBER_REGEX.test(number)) next.accountNumber = t("web.business.payout.errorAccountNumber");
      else if (confirm.replace(/[\s-]/g, "") !== number) next.confirm = t("web.business.payout.errorConfirm");
      if (!IFSC_REGEX.test(code)) next.ifsc = t("web.business.payout.errorIfsc");
      setErrors(next);
      return Object.keys(next).length ? null : { method, accountHolderName: name, accountNumber: number, ifsc: code };
    }
    const id = upiId.trim().toLowerCase();
    if (!UPI_ID_REGEX.test(id)) next.upiId = t("web.business.payout.errorUpi");
    setErrors(next);
    return Object.keys(next).length ? null : { method, accountHolderName: name, upiId: id };
  }

  const pending = mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => (next || pending ? null : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{account ? t("web.business.payout.dialogEditTitle") : t("web.business.payout.dialogAddTitle")}</DialogTitle>
          <DialogDescription>{t("web.business.payout.dialogIntro")}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (pending) return;
            const input = validate();
            if (input) mutation.mutate(input);
          }}
        >
          <div className="space-y-1.5">
            <Label id="payout-method-label">{t("web.business.payout.methodLabel")}</Label>
            <ToggleGroup
              aria-labelledby="payout-method-label"
              variant="outline"
              spacing={0}
              className="w-full"
              value={[method]}
              onValueChange={(value) => {
                const picked = value[0] as PayoutAccountMethod | undefined;
                if (picked) {
                  setMethod(picked);
                  setErrors({});
                }
              }}
            >
              <ToggleGroupItem value="bank" className="h-10 flex-1 sm:h-9">
                {t("web.business.payout.methodBank")}
              </ToggleGroupItem>
              <ToggleGroupItem value="upi" className="h-10 flex-1 sm:h-9">
                {t("web.business.payout.methodUpi")}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <Field id="payout-holder" label={t("web.business.payout.holder")} error={errors.holder}>
            <Input
              id="payout-holder"
              value={holder}
              onChange={(e) => setHolder(e.target.value)}
              placeholder={t("web.business.payout.holderPlaceholder")}
              autoComplete="name"
              maxLength={100}
              aria-invalid={!!errors.holder}
            />
          </Field>

          {method === "bank" ? (
            <>
              <Field id="payout-account-number" label={t("web.business.payout.accountNumber")} error={errors.accountNumber}>
                <Input
                  id="payout-account-number"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder={t("web.business.payout.accountNumberPlaceholder")}
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={24}
                  aria-invalid={!!errors.accountNumber}
                />
              </Field>
              <Field id="payout-account-confirm" label={t("web.business.payout.confirmAccountNumber")} error={errors.confirm}>
                <Input
                  id="payout-account-confirm"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={24}
                  aria-invalid={!!errors.confirm}
                />
              </Field>
              <Field id="payout-ifsc" label={t("web.business.payout.ifsc")} error={errors.ifsc}>
                <Input
                  id="payout-ifsc"
                  value={ifsc}
                  onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                  placeholder={t("web.business.payout.ifscPlaceholder")}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={11}
                  className="uppercase"
                  aria-invalid={!!errors.ifsc}
                />
              </Field>
            </>
          ) : (
            <Field id="payout-upi" label={t("web.business.payout.upiId")} error={errors.upiId}>
              <Input
                id="payout-upi"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder={t("web.business.payout.upiPlaceholder")}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={100}
                aria-invalid={!!errors.upiId}
              />
            </Field>
          )}

          {account ? <p className="text-xs text-muted-foreground">{t("web.business.payout.reenterHint")}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" className="h-10 sm:h-8" onClick={onClose} disabled={pending}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" className="h-10 sm:h-8" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {t("web.business.payout.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
