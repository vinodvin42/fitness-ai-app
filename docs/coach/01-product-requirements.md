# Product Requirements — 23PrimeFit Coach App

## 1. Summary

This covers the third Figma file reviewed for this project: **v1-coach** (`fileKey: rWjLV3qEnwuEy6Avuo7ggT`), a single page ("Page 1") containing **16 screens** for the professional/coach-facing side of 23PrimeFit — same "23" brand mark as the other two apps, but a **distinct lime/yellow-green accent color**, different again from the consumer app's blue and the admin console's mint green (see [04-design-system.md](04-design-system.md) and the open question in [07-open-questions-gaps.md](07-open-questions-gaps.md)).

This is the smallest of the three reviewed surfaces, and it is tightly scoped: coach onboarding/verification, a coach-facing dashboard (with variants per service type), client relationship management, and — notably — a second copy of the "find and book a coach" flow that also exists (differently) in the consumer app. See §3.

## 2. What this app is for

Independent professionals (fitness coaches and/or nutritionists) use this app to: sign up and get verified, manage their coaching practice from a dashboard (today's schedule, client adherence, quick actions), and manage individual client relationships (training program, checklist, next session). It's the professional counterpart to the admin console's **Professionals** (03.x) module — where admin *verifies and administers* professionals in aggregate, this app is where a professional *runs their own practice* day to day.

## 3. Important finding: this file duplicates part of the consumer app

Five to seven of this file's 16 screens are prefixed `user-` (not `coach-` or `professional-`) and implement **the same "find and book a coach" journey already designed in the v1-user file** ([docs/mobile/03-screen-inventory.md](../mobile/03-screen-inventory.md) §J: Find a Coach, Coach Booking, Coach Messaging, Coach Session Summary) — but as a **different design**, with different screens, different filter taxonomy, and a different bottom-nav label set. This is not a small detail; it's the same user journey specified twice, inconsistently. Full comparison and recommended resolution in [07-open-questions-gaps.md](07-open-questions-gaps.md) §1 — **read that before doing any implementation planning for coach discovery or booking.**

## 4. Onboarding is service-scoped and verification-gated

A professional selects which services they offer (Fitness Coaching and/or Nutrition Coaching — multi-select, not exclusive) before anything else, then uploads credentials **per service** (certification document, qualification certificate, government ID/KYC), and lands on a status screen showing **independent verification state per service** (e.g. "Fitness Coaching: Verified ✓" while "Nutrition Coaching: Not Verified" is still pending) — a coach can start accepting clients for an already-verified service while another is still under review. This maps directly and precisely to the admin console's Credential Verification workflow (03.03), which reviews "Fitness Credential Review" and "Nutrition Credential Review" as separate blocks per applicant — strong confirmation the two files describe the same backing system.

## 5. The dashboard adapts to what services a coach offers

Three dashboard variants were designed — fitness-only, nutrition-only, and combined — rather than one dashboard with conditional sections hidden ad hoc. Each shows: profile header with service badge(s), stat tiles (active clients, sessions/consultations per week, average rating), today's schedule, an adherence chart (training or nutrition adherence, or both, over the week), and quick actions relevant to the service (Create Workout Plan / Create Nutrition Plan / Schedule Session / Log Nutrition Adherence). This is a good pattern to preserve in implementation — build one dashboard component with service-scoped sections, driven by the coach's verified-services list, rather than three near-duplicate screens.

## 6. Bottom navigation (coach-side)

**Dashboard, Clients, Calendar, Messages, More** — a 5-tab shell distinct from the consumer app's **Today, Train, Fuel, Recover, More**, appropriately reflecting a professional's workflow (managing clients/schedule/communication) rather than a personal fitness loop. See [02-information-architecture.md](02-information-architecture.md).

## 7. Explicitly out of scope / not found in this file

- Calendar, Messages, and "More" tab screens themselves were **not designed** — only referenced by the bottom nav on other screens. Only Dashboard and a client-profile-under-Clients screen exist as actual frames.
- Coach-side earnings/payout screens (the admin console's Coach Settlements, 10.06, implies a coach should be able to see their own payout status somewhere, but no such screen exists here).
- Coach-side content creation screens (Create Workout Plan / Create Nutrition Plan are referenced as quick actions but have no destination screen designed).
- Any messaging/chat UI on the coach side (the consumer app has `user-coach-messaging`; no coach-side equivalent exists here).
- Empty, loading, and error states (same gap as the other two apps).
