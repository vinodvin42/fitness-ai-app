/**
 * Invite links → the raw acquisition context the app stores until sign-up ("gym:ABC123",
 * "creator:XYZ"). Pure string handling with no `URL` or expo-linking, like lib/deepLink.ts, so it
 * behaves the same on a phone, on the web and in tests/inviteLinks.check.cjs.
 *
 * Recognised (any app scheme; an Expo dev link's `…/--/` prefix is ignored):
 * - `fynrox://join?source=gym&code=ABC123` and `…source=creator…` (the original shape);
 * - `fynrox://gym/ABC123`: the app link the API's deep-link provider builds for a gym invite;
 * - `fynrox://r/XYZ`: the app link it builds for a creator referral.
 *
 * Before Oct 2026 the parser read `Linking.parse(url).path === "join"`. With standard URL parsing
 * `join` is the host of `fynrox://join?…`, not its path, so no invite link was ever captured.
 */
export function parseAcquisitionContext(url: string): string | null {
  if (typeof url !== "string") return null;
  const queryAt = url.indexOf("?");
  const query = new URLSearchParams(queryAt >= 0 ? url.slice(queryAt + 1).replace(/#.*$/, "") : "");
  let path = url.replace(/[?#].*$/, "").replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const devPrefix = path.indexOf("/--/");
  if (devPrefix >= 0) path = path.slice(devPrefix + 4);
  const parts = path.replace(/^\/+|\/+$/g, "").split("/");
  const head = (parts[0] ?? "").toLowerCase();

  let source: string | null = null;
  let code: string | null = null;
  if (head === "join") {
    source = query.get("source");
    code = query.get("code");
  } else if (head === "gym" && parts.length === 2) {
    source = "gym";
    code = safeDecode(parts[1]);
  } else if (head === "r" && parts.length === 2) {
    source = "creator";
    code = safeDecode(parts[1]);
  }

  if (source !== "gym" && source !== "creator") return null;
  const trimmed = (code ?? "").trim();
  // Same limit as the API's invite-code params (deepLinks.routes.ts).
  if (!trimmed || trimmed.length > 64) return null;
  return `${source}:${trimmed}`;
}

/** The gym's invite code from a stored context ("gym:ABC123" → "ABC123"); it is also its partner code. */
export function gymCodeFromContext(context: string | null | undefined): string | null {
  if (!context || !context.startsWith("gym:")) return null;
  const code = context.slice(4).trim();
  return code || null;
}

/** A short, honest label for a captured context ("gym:ABC123" → "Invited via gym code ABC123"); null if unknown. */
export function describeAcquisitionContext(context: string): string | null {
  const [source, ...rest] = context.split(":");
  const code = rest.join(":");
  if (!code) return null;
  if (source === "gym") return `Invited via gym code ${code}`;
  if (source === "creator") return `Invited via creator code ${code}`;
  return null;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
