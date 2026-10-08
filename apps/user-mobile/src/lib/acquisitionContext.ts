import * as Linking from "expo-linking";
import * as secureStore from "./secureStore";

/**
 * Acquisition-context capture — R1 Developer 1 U1 (14 Sep 2026), the
 * "acquisition-context recovery" quarter of that milestone.
 *
 * **What this deliberately is, and isn't.** Developer 1's own R1 work
 * package is explicit that Acquisition Context (Source/Campaign/
 * Touchpoint) is Developer 3's own future foundation — Developer 1
 * "reads" it, never redefines it. Since Developer 3 hasn't built that
 * model yet (no `Gym`/`Campaign`/`Source`/`Touchpoint` entity exists
 * anywhere in this schema — see docs/mobile/07-open-questions-gaps.md's
 * own U1 audit), there's nothing real to read FROM yet. What IS
 * genuinely Developer 1's own job, and buildable right now without
 * inventing Developer 3's model: making sure whatever raw context a user
 * arrives with (a gym's QR code, a creator's invite link) is captured
 * and preserved through signup rather than silently lost, so Developer
 * 3's future model has real data to reconcile against instead of a gap
 * in history. `User.acquisitionContext` (apps/api/prisma/schema.prisma)
 * is exactly that — a raw, honest string, never fabricated, explicitly
 * documented there as a placeholder Developer 3's real model will
 * eventually supersede.
 *
 * **Capture, not routing.** `RootNavigator.tsx` is a conditional switch
 * between four entirely separate root components (Auth/Onboarding/Lock/
 * Main), not one navigator with named branches — so a single static
 * `NavigationContainer` `linking` config can't cleanly express "route to
 * Signup no matter which branch is active" without a real navigation
 * restructure this pass doesn't attempt. Instead: the incoming URL is
 * captured directly (via `expo-linking`, independent of React
 * Navigation's own routing) the moment the app launches or receives one
 * while running, and stored until signup actually happens — the user
 * still lands wherever the app's normal auth-state logic puts them
 * (Splash/Login for a fresh install), and taps through to Sign Up
 * themselves. This guarantees the context survives that gap without
 * needing to solve deep-link ROUTING in the same pass.
 *
 * URL shape recognized: `fynrox://join?source=<gym|creator>&code=<code>`
 * (also matches the Expo-dev-client-wrapped equivalent via
 * `Linking.parse()`, which handles both forms transparently). An
 * unrecognized URL/shape is not an error — it's simply not captured,
 * same "an unrecognized code doesn't block anything" precedent
 * `referrals.service.ts` already sets for the peer referral-code field
 * this is deliberately separate from.
 *
 * **Honest verification note:** `expo-linking` transitively imports
 * `react-native`'s own entry point (Flow syntax), which only transforms
 * under Metro's own babel config — it can't be exercised via a plain
 * `node`/`tsx` script in this sandbox (confirmed by trying, not assumed
 * — esbuild fails on `react-native/index.js` directly). Same "no device/
 * simulator here to test against" limitation this codebase already
 * documents for other Expo-native-module code (see AiCoachScreen.tsx's
 * own comment on cross-navigator deep-linking). The parsing logic below
 * is deliberately simple (one path check, one allow-list, one trim) and
 * `Linking.parse()` itself is Expo's own well-established, independently
 * tested API — reviewed carefully rather than exercised end-to-end here.
 */

const STORAGE_KEY = "pendingAcquisitionContext";

/** Parses a `fynrox://join?source=...&code=...` URL into the raw string persisted/sent to the server — e.g. "gym:ABC123". Returns null for any URL that isn't this shape; never throws on a malformed URL. */
export function parseAcquisitionContext(url: string): string | null {
  let parsed: ReturnType<typeof Linking.parse>;
  try {
    parsed = Linking.parse(url);
  } catch {
    return null;
  }

  if (parsed.path !== "join") return null;
  const source = parsed.queryParams?.source;
  const code = parsed.queryParams?.code;
  if (typeof source !== "string" || typeof code !== "string") return null;
  if (source !== "gym" && source !== "creator") return null;
  const trimmedCode = code.trim();
  if (!trimmedCode) return null;

  return `${source}:${trimmedCode}`;
}

/** Parses and persists a URL's acquisition context, if any — first-touch only, never overwrites an already-captured value (the standard "preserve the original acquisition journey" convention Developer 3's own future model will expect). No-op for a URL that doesn't match. */
export async function captureAcquisitionContext(url: string): Promise<void> {
  const context = parseAcquisitionContext(url);
  if (!context) return;
  const existing = await secureStore.getItemAsync(STORAGE_KEY);
  if (existing) return;
  await secureStore.setItemAsync(STORAGE_KEY, context);
}

export async function getStoredAcquisitionContext(): Promise<string | null> {
  return secureStore.getItemAsync(STORAGE_KEY);
}

/** Called once signup actually completes (successfully OR not — either way this attempt is over) so a stale value never gets attached to some later, unrelated signup. */
export async function clearStoredAcquisitionContext(): Promise<void> {
  await secureStore.deleteItemAsync(STORAGE_KEY);
}

/** A short, honest, human-readable label for whatever raw context was captured — e.g. "gym:ABC123" -> "Invited via gym code ABC123". Returns null for anything it doesn't recognize rather than guessing. */
export function describeAcquisitionContext(context: string): string | null {
  const [source, ...rest] = context.split(":");
  const code = rest.join(":");
  if (!code) return null;
  if (source === "gym") return `Invited via gym code ${code}`;
  if (source === "creator") return `Invited via creator code ${code}`;
  return null;
}
