# Product Requirements — 23PrimeFit User Mobile App

## 1. Summary

This covers the second Figma file reviewed for this project: **v1-user** (`fileKey: goXnXRimiQom0cq8p8Mvtj`), a single page ("01 - Design System") containing **82 mobile screens** for the consumer-facing iOS app, branded **"23PrimeFit"** — the same product family as the Super Admin Console documented in [../01-product-requirements.md](../admin/01-product-requirements.md), confirmed by the shared "23" logo mark and PrimeFit wordmark. Where the admin console is the internal back office, this app is what end users actually use day to day: onboarding, training, nutrition, recovery, progress tracking, an AI coach, a human-coach marketplace, and subscription/payments.

All 82 frames are fixed at 390×844 (iOS mobile viewport, notch-style status bar + home indicator throughout) — this is an **iOS-first, phone-only** design; no tablet or Android-specific frames were found.

## 2. Product pillars (inferred from module weight)

Training is by far the largest module (16 of 82 screens), followed by Nutrition (7), Progress & Body (7), Subscription & Payments (7), Settings (6), Profile (6), Onboarding (8), Recovery & Devices (5), Home (5), Timeline (4), Programs Commerce (4), Coaching Marketplace (4). This weighting suggests the core loop is **AI-guided training + nutrition logging**, with **recovery/wearable integration** and a **human coach marketplace** as premium layers on top, monetized through **tiered subscriptions**.

## 3. AI is the product's defining feature, not a bolt-on

An **AI Coach floating action button** ("ai-coach-fab") appears on nearly every Training, Nutrition, Recovery, and Progress screen, alongside:
- An **"AI Daily Brief"** and **Readiness Score** on the Today home screen.
- **AI-recommended workouts** and an **AI-picked exercise swap** flow (`trn-09-exercise-swap`) with a dedicated "AI Pick" section.
- A **live AI banner during active workouts** with "why" and "override" actions (`trn-07-active-workout`) — the AI can adjust a workout mid-session, and the user can ask why or override it.
- **AI nutrition suggestions** and an **AI-generated meal plan** (`user-meal-plan`) with a "sparkles" banner.
- **AI Recovery Insight** on the recovery dashboard.
- **AI Insights** — a dedicated predictive screen (`user-ai-insights`) with a "core prediction," a plateau warning, a forecast row, and an anomalies list.
- A full **AI Coach chat** screen (`user-ai-coach-chat`) branded "23Prime AI" with guidance chips (Training Plan, Exercise Form, Nutrition Advice, Recovery) and a disclaimer footer: *"AI Coach provides general fitness and wellness guidance only. Not a substitute for professional medical advice."*

This directly corresponds to the Admin Console's **AI Operations** module (11.01–11.03), which manages exactly these capabilities as named, versioned models with rollout/latency/error-rate controls (e.g. "FitGPT Workout Plan Generator", "PrimeVision Photo Diet Log", "AI Health Score Forecaster") — see [06-cross-app-integration.md](06-cross-app-integration.md).

## 4. Human coaching is a second, parallel track

Independent of the AI coach, the app has a full **human coach marketplace**: browse/filter coaches by specialty (Fitness, Nutrition, Yoga, Sports), view ratings and per-session pricing (in ₹), book a session, message a coach directly (including a coach sharing a workout plan card in-chat), and review a session summary afterward. This maps directly to the admin console's **Professionals** (03.x) and **Relationships** (04.x) modules.

## 5. Monetization model (as designed)

Three tiers were read directly off the subscription plans screen: **Basic/Free** (manual logging, basic tracking), **Premium Pro** (₹299/mo, "AI Nutrition/Training full access", routines, health dashboard, progress tracking, most-popular badge), and **Elite Coach** (₹2,999/mo, everything in Pro plus personalized human coach check-ins and form reviews, direct messaging). A separate program-purchase flow also sells **individual programs** (e.g. "Sustainable Weight Loss — 12 Weeks") with an **AI Program** vs. **AI + Coach** add-on choice at checkout, priced independently of the subscription tiers (₹1,299 vs ₹1,799 in the sampled screen) — worth clarifying with product whether program purchases and subscription tiers stack, are mutually exclusive, or program access is itself gated by subscription tier (see [07-open-questions-gaps.md](07-open-questions-gaps.md)).

Payment methods shown: UPI (GPay/PhonePe/BHIM), credit/debit cards, net banking, and native Apple Pay/Google Pay — consistent with an India-first market (also seen in the "+91" phone-first signup and the 10-language localization screen, see §7).

## 6. Wearables & device integration

A dedicated device-management flow: a hub listing connected devices (sample data shows a Mi Band, boAt Wave, and Google Fit sync — mid-market Indian wearable brands), an add-device flow browsing categories (smartwatches, fitness bands, activity trackers, smart scales), a Bluetooth pairing screen with a granular permissions list (Steps & Distance, Heart Rate, Sleep Tracking, Blood Oxygen SpO2, Stress Level, Workout Auto-Detect — each independently toggleable), and a sync-status dashboard. Also has native running/cycling GPS trackers with live map, heart-rate zones, splits, and pace/cadence/power telemetry — these appear to be **built-in tracking**, independent of a connected wearable.

## 7. Localization signal

A dedicated language-selection screen offers **10 languages**: English, Hindi, Tamil, Telugu, Kannada, Marathi, Bengali, Gujarati, Malayalam, Punjabi — all major Indian languages, reinforcing an India-first (likely India-only at launch) market strategy, consistent with the admin console's multi-region design but with India as the clear anchor market.

## 8. Explicitly out of scope / not found in this Figma file

- Android-specific screens or layouts (iOS-only frames throughout).
- Tablet/large-screen layouts.
- A social/community feed (no evidence of one, despite a referral/invite feature existing).
- Wear OS / Apple Watch companion app screens (the app *connects to* watches, but no watch-app UI itself was found).
- Empty, loading, and error states for any screen (same gap pattern as the admin console — see [07-open-questions-gaps.md](07-open-questions-gaps.md)).
