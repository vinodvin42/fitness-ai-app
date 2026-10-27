import { useEffect, useRef, useState } from "react";
import { dismissNotice, MIN_REASON_LENGTH, subscribeReasonPrompt, type Notice, type ReasonRequest } from "../lib/reasonPrompt";

/**
 * Renders the in-app "why are you making this change?" dialog and the
 * "sent for approval" notices (lib/reasonPrompt.ts). Mounted once, at the
 * app root. The reason must be at least 10 characters — the same rule the
 * API enforces — and Escape or Cancel cancels the change.
 */
export function ReasonDialogHost() {
  const [request, setRequest] = useState<ReasonRequest | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [reason, setReason] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(
    () =>
      subscribeReasonPrompt((s) => {
        setRequest(s.request);
        setNotices(s.notices);
      }),
    [],
  );

  useEffect(() => {
    setReason("");
    if (request) window.setTimeout(() => textRef.current?.focus(), 0);
  }, [request]);

  const trimmed = reason.trim();
  const valid = trimmed.length >= MIN_REASON_LENGTH;

  return (
    <>
      {request && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onKeyDown={(e) => {
            if (e.key === "Escape") request.resolve(null);
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="reason-dialog-title"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) request.resolve(trimmed);
            }}
            className="w-full max-w-md space-y-3 rounded-xl border border-border-subtle bg-surface shadow-xs p-5 shadow-xl"
          >
            <h2 id="reason-dialog-title" className="text-sm font-medium text-text-primary">
              Reason for this change
            </h2>
            <p className="text-xs text-text-secondary">{request.question}</p>
            <textarea
              ref={textRef}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-describedby="reason-dialog-hint"
              className="w-full rounded-md border border-border-subtle bg-surface-raised p-2 text-sm text-text-primary outline-none focus:border-accent"
            />
            <p id="reason-dialog-hint" className={`text-[11px] ${valid ? "text-text-dim" : "text-warning"}`}>
              {valid ? "Saved to the audit log." : `At least ${MIN_REASON_LENGTH} characters (${trimmed.length} so far).`}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => request.resolve(null)}
                className="rounded-md border border-border-subtle px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary"
              >
                Cancel
              </button>
              <button type="submit" disabled={!valid} className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40">
                Continue
              </button>
            </div>
          </form>
        </div>
      )}

      {notices.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2" role="status" aria-live="polite">
          {notices.map((n) => (
            <div key={n.id} className="rounded-lg border border-accent/40 bg-surface p-3 text-xs text-text-primary shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <span>{n.message}</span>
                <button type="button" onClick={() => dismissNotice(n.id)} aria-label="Dismiss" className="text-text-dim hover:text-text-primary">
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
