# FynroX — Landing Page

Public marketing/landing page for FynroX. Plain static HTML/CSS/vanilla
JS — no build step, no framework, no npm dependencies. Deploys to Azure
Static Web Apps alongside `apps/admin-web` and `apps/user-mobile`.

## Run it locally

```bash
npm run dev --workspace=apps/landing
```

Serves this folder at `http://localhost:4173` (override with `PORT=xxxx`).
`serve.js` is a ~40-line zero-dependency static file server using only
Node's built-in `http`/`fs` — nothing to `npm install`. You can also just
open `index.html` directly in a browser; the only thing that won't work
without a server is deep-linking straight to a `#hash` on first load in some
browsers, which doesn't matter for how this page is actually used.

## Deploy

Target is Azure Static Web Apps, zero-config: app location `/`, no build
command, output location `/` (this folder is the whole deployable unit).
`staticwebapp.config.json` is already set up (asset caching, a couple of
standard security headers, single-page navigation fallback).

## Before this goes live for real pilot testers

The **Android** download card is a real placeholder, not a finished
feature — see the large HTML comment directly above the Android
`<article class="platform-card">` in `index.html` for the exact three edits
needed once a real APK exists:

1. Run `eas build --platform android --profile preview -e apps/user-mobile`
   from the repo root (needs a free Expo account — see
   `DEPLOY-RUNBOOK.md` §7). It finishes with a real, direct `.apk` URL.
2. Swap that URL into the Android card's `<a href="#android-apk-pending">`.
3. Remove that link's `is-pending` class and `aria-disabled="true"`, and
   change its label from "Coming Soon" to "Download APK".

**iOS** has no link at all yet, on purpose — TestFlight distribution isn't
set up, so there's nothing real to point at. Don't add one until it exists.

## Structure

- `index.html` — the entire page (single file, no templating).
- `assets/css/styles.css` — design tokens ported from
  `apps/user-mobile/src/theme/tokens.ts` (same colors/fonts/radii as the
  shipped app) plus every component style.
- `assets/js/main.js` — header scroll state, scroll-reveal animation, and
  the footer year. All progressive enhancement — the page is fully
  readable and navigable with JavaScript disabled.
- `assets/favicon.svg` — a small mark echoing the app's own "progress ring"
  component, not a fabricated logo.
- `serve.js` — local-only dev server (see above). Not used in production.
- `staticwebapp.config.json` — Azure Static Web Apps config.
- `robots.txt` — allows indexing (nothing on this page is private).

## What this page deliberately does not say

No app-store ratings, testimonials, download counts, or user numbers —
there aren't any yet (first pilot hasn't run). No pricing/subscription
tiers — nothing in the shipped app actually gates a feature by tier yet, so
a comparison table would either show three identical lists or invent a
difference that isn't real. No wearable/device sync, no video exercise
demos, no live chat, no barcode scanning — none of these are built yet;
see `docs/mobile/07-open-questions-gaps.md` for the full list of what's
still open.
