import * as secureStore from "./secureStore";
import { parseAcquisitionContext } from "./inviteLinks";

export { describeAcquisitionContext, gymCodeFromContext, parseAcquisitionContext } from "./inviteLinks";

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
 * Recognised links and the parsing itself: lib/inviteLinks.ts (pure string handling, checked by
 * tests/inviteLinks.check.cjs). An unrecognised URL is not an error; it simply isn't captured.
 *
 * **Oct 2026:** a gym invite now also links the gym after sign-up. Its invite code is the gym's
 * partner code (userPartner.service.ts looks both up as Gym.inviteCode), so SignupScreen calls
 * POST /users/me/partner-code with it once the account exists. An expired or unknown code is
 * ignored: the member signs up with nothing applied, as the website's invite page promises.
 */

const STORAGE_KEY = "pendingAcquisitionContext";

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
