import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { AdminMemberCreditItem, AdminMemberSessionItem, AdminMemberSessionsResponse } from "@fitness-ai-app/types";
import { Badge } from "../../components/ui/badge";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";

function rupees(cents: number): string {
  return `₹${(cents / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString();
}

/**
 * User Profile → "Sessions & credits" (27 Oct 2026 gap fix). Read-only: the
 * member's coach bookings (who cancelled, a coach's proposed new time, how
 * each was paid) and every session credit, used and expired ones included.
 * Backed by GET /admin/users/:id/sessions (users: view).
 */
export function MemberSessionsTab({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-member-sessions", userId],
    queryFn: async () => (await apiClient.get<AdminMemberSessionsResponse>(`/admin/users/${userId}/sessions`)).data,
  });

  if (isLoading) return <p className="text-sm text-text-secondary">{t("memberSessions.loading")}</p>;
  if (isError || !data) {
    return (
      <div className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
        {extractErrorMessage(error, t("memberSessions.loadError"))}
        <button type="button" onClick={() => refetch()} className="ml-3 underline">
          {t("memberSessions.retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface shadow-xs">
        <div className="border-b border-border-subtle px-4 py-3 text-xs uppercase tracking-wide text-text-dim">
          {t("memberSessions.sessions")}
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
              <th className="px-4 py-3 font-normal">{t("memberSessions.when")}</th>
              <th className="px-4 py-3 font-normal">{t("memberSessions.coach")}</th>
              <th className="px-4 py-3 font-normal">{t("memberSessions.price")}</th>
              <th className="px-4 py-3 font-normal">{t("memberSessions.paidWith")}</th>
              <th className="px-4 py-3 font-normal">{t("memberSessions.status")}</th>
            </tr>
          </thead>
          <tbody>
            {data.sessions.map((s) => (
              <SessionRow key={s.bookingId} s={s} />
            ))}
            {data.sessions.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-dim">
                  {t("memberSessions.noSessions")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface shadow-xs">
        <div className="border-b border-border-subtle px-4 py-3 text-xs uppercase tracking-wide text-text-dim">
          {t("memberSessions.credits")}
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
              <th className="px-4 py-3 font-normal">{t("memberSessions.amount")}</th>
              <th className="px-4 py-3 font-normal">{t("memberSessions.reason")}</th>
              <th className="px-4 py-3 font-normal">{t("memberSessions.fromSession")}</th>
              <th className="px-4 py-3 font-normal">{t("memberSessions.status")}</th>
              <th className="px-4 py-3 font-normal">{t("memberSessions.issued")}</th>
            </tr>
          </thead>
          <tbody>
            {data.credits.map((c) => (
              <CreditRow key={c.id} c={c} />
            ))}
            {data.credits.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-dim">
                  {t("memberSessions.noCredits")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SessionRow({ s }: { s: AdminMemberSessionItem }) {
  const { t } = useTranslation();
  const upcoming = s.status === "confirmed" && new Date(s.scheduledAt) > new Date();
  return (
    <tr className="border-b border-border-subtle align-top last:border-0">
      <td className="px-4 py-3 text-text-secondary">
        {when(s.scheduledAt)}
        <div className="text-xs text-text-dim">{t("memberSessions.minutes", { count: s.durationMinutes })}</div>
      </td>
      <td className="px-4 py-3">
        <Link to={`/professionals/${s.professionalId}`} className="text-text-primary hover:text-accent hover:underline">
          {s.coachName}
        </Link>
        <div className="text-xs text-text-dim">{s.offeringLabel}</div>
      </td>
      <td className="px-4 py-3 text-text-secondary">
        {rupees(s.priceCents + s.gstCents)}
        {s.gstCents > 0 && (
          <div className="text-xs text-text-dim">
            {t("memberSessions.feePlusGst", { fee: rupees(s.priceCents), gst: rupees(s.gstCents) })}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-text-secondary">
        {s.paidWith === "credit" && <Badge variant="secondary">{t("memberSessions.paidWithCredit")}</Badge>}
        {s.paidWith === "free" && <span className="text-text-dim">{t("memberSessions.free")}</span>}
        {s.paidWith === "payment" &&
          (s.paymentId ? (
            <Link to={`/commerce/${s.paymentId}`} className="text-accent hover:underline">
              {t("memberSessions.viewPayment")}
            </Link>
          ) : (
            <span className="text-xs text-text-dim">{t("memberSessions.paymentNotLinked")}</span>
          ))}
      </td>
      <td className="px-4 py-3">
        {s.status === "cancelled" ? (
          <div className="space-y-1">
            <Badge variant="destructive">{cancelledByLabel(t, s.cancelledBy)}</Badge>
            {s.cancelledAt && <div className="text-xs text-text-dim">{when(s.cancelledAt)}</div>}
            {s.cancelReason && <div className="text-xs text-text-secondary">“{s.cancelReason}”</div>}
            {s.creditIssued && (
              <div className="text-xs text-text-secondary">
                {t("memberSessions.creditIssued", { amount: rupees(s.creditIssued.amountCents) })}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            <Badge variant="outline">{upcoming ? t("memberSessions.upcoming") : t("memberSessions.delivered")}</Badge>
            {s.proposedScheduledAt && (
              <div className="text-xs font-medium text-warning">
                {t("memberSessions.newTimeProposed", { time: when(s.proposedScheduledAt) })}
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

function CreditRow({ c }: { c: AdminMemberCreditItem }) {
  const { t } = useTranslation();
  return (
    <tr className="border-b border-border-subtle align-top last:border-0">
      <td className="px-4 py-3 font-medium text-text-primary">{rupees(c.amountCents)}</td>
      <td className="px-4 py-3 text-text-secondary">
        {c.reason === "reschedule_declined" ? t("memberSessions.reasonDeclined") : t("memberSessions.reasonCancelled")}
      </td>
      <td className="px-4 py-3 text-text-secondary">
        {when(c.sourceBooking.scheduledAt)}
        <div className="text-xs text-text-dim">
          {c.sourceBooking.coachName} · {c.sourceBooking.offeringLabel}
        </div>
      </td>
      <td className="px-4 py-3">
        {c.state === "used" && (
          <div className="space-y-1">
            <Badge variant="secondary">{t("memberSessions.creditUsed")}</Badge>
            {c.usedAt && <div className="text-xs text-text-dim">{when(c.usedAt)}</div>}
            {c.usedBooking && (
              <div className="text-xs text-text-secondary">
                {t("memberSessions.usedOn", { time: when(c.usedBooking.scheduledAt), coach: c.usedBooking.coachName })}
              </div>
            )}
          </div>
        )}
        {c.state === "available" && (
          <div className="space-y-1">
            <Badge variant="outline">{t("memberSessions.creditAvailable")}</Badge>
            <div className="text-xs text-text-dim">{t("memberSessions.expires", { date: new Date(c.expiresAt).toLocaleDateString() })}</div>
          </div>
        )}
        {c.state === "expired" && (
          <div className="space-y-1">
            <Badge variant="destructive">{t("memberSessions.creditExpired")}</Badge>
            <div className="text-xs text-text-dim">{new Date(c.expiresAt).toLocaleDateString()}</div>
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-text-dim">{new Date(c.createdAt).toLocaleDateString()}</td>
    </tr>
  );
}

function cancelledByLabel(t: (key: string) => string, by: string | null): string {
  if (by === "member") return t("memberSessions.cancelledByMember");
  if (by === "coach") return t("memberSessions.cancelledByCoach");
  if (by === "admin") return t("memberSessions.cancelledByAdmin");
  return t("memberSessions.cancelled");
}
