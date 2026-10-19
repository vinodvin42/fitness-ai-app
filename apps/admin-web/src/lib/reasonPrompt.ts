/**
 * The "why are you making this change?" step (maker-checker, D21), as an
 * in-app dialog instead of the browser's window.prompt. lib/api.ts awaits
 * `requestReason` for any risky write that doesn't already carry a reason;
 * components/ReasonDialogHost.tsx renders the dialog. A 202
 * "pending_approval" answer is announced with `showApprovalNotice`, so the
 * admin sees plainly that nothing has changed yet.
 *
 * If no host is mounted (it always is in the app), it falls back to
 * window.prompt so a write is never silently blocked.
 */

export const MIN_REASON_LENGTH = 10;

export type ReasonRequest = { question: string; resolve: (reason: string | null) => void };
export type Notice = { id: number; message: string };
type State = { request: ReasonRequest | null; notices: Notice[] };

let state: State = { request: null, notices: [] };
const listeners = new Set<(s: State) => void>();
let nextNoticeId = 1;
/** Writes waiting for a reason, shown one at a time in arrival order. */
const queue: ReasonRequest[] = [];

function emit() {
  for (const l of listeners) l(state);
}

export function subscribeReasonPrompt(listener: (s: State) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

/** Resolves with the trimmed reason, or null when the admin cancels. */
export function requestReason(question: string): Promise<string | null> {
  if (listeners.size === 0) {
    const answer = window.prompt(question);
    return Promise.resolve(answer === null ? null : answer.trim());
  }
  return new Promise((resolve) => {
    queue.push({
      question,
      resolve: (reason) => {
        queue.shift();
        state = { ...state, request: queue[0] ?? null };
        emit();
        resolve(reason === null ? null : reason.trim());
      },
    });
    if (queue.length === 1) {
      state = { ...state, request: queue[0] };
      emit();
    }
  });
}

export function showApprovalNotice(message: string) {
  const id = nextNoticeId++;
  state = { ...state, notices: [...state.notices, { id, message }] };
  emit();
  window.setTimeout(() => dismissNotice(id), 10_000);
}

export function dismissNotice(id: number) {
  state = { ...state, notices: state.notices.filter((n) => n.id !== id) };
  emit();
}
