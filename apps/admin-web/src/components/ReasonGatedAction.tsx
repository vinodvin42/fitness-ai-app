import { useState } from "react";
import { extractErrorMessage } from "../lib/apiError";

interface ReasonGatedActionProps {
  title: string;
  description: string;
  actionLabel: string;
  /** Default 10 — matches the precedent this component generalizes (subscription force-revoke, UserProfileScreen.tsx). */
  minReasonLength?: number;
  isPending: boolean;
  isError?: boolean;
  error?: unknown;
  onConfirm: (reason: string) => void;
  /** danger = destructive/irreversible (red); warning = high-impact but not destructive (amber). Default danger. */
  tone?: "danger" | "warning";
}

/**
 * R2 Wave 0 (19 Sep 2026) — BR-ADM-005 ("high-impact actions require impact
 * visibility, reason, confirmation and audit") made consistent across the
 * admin console. Before this pass, exactly one action in this whole build
 * enforced reason+confirmation together: subscription force-revoke
 * (UserProfileScreen.tsx's own inline card, gap §57). Every other
 * high-impact action (suspend professional, credential reject) had a real
 * `recordAudit` trail but only an OPTIONAL notes field and a single
 * unguarded click — an admin could suspend someone's professional account
 * or reject their credential with zero explanation on record.
 *
 * This is that same real, working inline-card pattern (this codebase has
 * no modal/dialog system to reuse — introducing one just for this would be
 * a bigger, unrelated change) extracted into one shared component instead
 * of copy-pasted a third time. "Confirmation" here is the button itself
 * staying disabled until a real reason is typed — the same mechanism the
 * original force-revoke card already used, not a separate confirm step,
 * since a second are-you-sure prompt on top of a reason requirement would
 * be friction this codebase's own UX conventions don't otherwise use.
 */
export function ReasonGatedAction({
  title,
  description,
  actionLabel,
  minReasonLength = 10,
  isPending,
  isError,
  error,
  onConfirm,
  tone = "danger",
}: ReasonGatedActionProps) {
  const [reason, setReason] = useState("");
  const toneClasses =
    tone === "danger"
      ? {
          border: "border-danger/30",
          bg: "bg-danger/5",
          label: "text-danger",
          focus: "focus:border-danger",
          button: "bg-danger text-white",
        }
      : {
          border: "border-warning/30",
          bg: "bg-warning/5",
          label: "text-warning",
          focus: "focus:border-warning",
          button: "bg-warning text-canvas",
        };

  return (
    <div className={`rounded-lg border ${toneClasses.border} ${toneClasses.bg} p-4`}>
      <div className={`text-xs uppercase tracking-wide ${toneClasses.label}`}>{title}</div>
      <p className="mt-1 text-xs text-text-secondary">{description}</p>
      <textarea
        placeholder={`Reason (required, at least ${minReasonLength} characters)`}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className={`mt-2 w-full rounded-md border border-border-subtle bg-surface-raised p-2 text-xs text-text-primary outline-none ${toneClasses.focus}`}
        rows={2}
      />
      <button
        type="button"
        disabled={reason.trim().length < minReasonLength || isPending}
        onClick={() => onConfirm(reason.trim())}
        className={`mt-2 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${toneClasses.button}`}
      >
        {actionLabel}
      </button>
      {isError && <p className="mt-2 text-xs text-danger">{extractErrorMessage(error, "That action didn't go through — check your connection and try again.")}</p>}
    </div>
  );
}
