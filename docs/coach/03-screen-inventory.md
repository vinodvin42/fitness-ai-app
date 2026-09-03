# Screen Inventory — Coach App

All 16 screens are ~402px-wide iOS frames on a single Figma page. Node IDs are in [../../figma-reference/coach-mobile.md](../../figma-reference/coach-mobile.md).

---

## A. Auth (2 screens)

- **Coach Signup** — full name, email, phone, password/confirm, terms checkbox, "Create Account" CTA, Google SSO option, login link. Headline: "Join as a Professional — Create your coaching account to connect with clients."
- **Coach Login** — email/password, "Forgot Password?", Google SSO, signup link.

---

## B. Onboarding (3 screens, linear, step-labeled "Coach Onboarding — Step X of 3")

- **Service Selection** (step 1) — two selectable cards, **not mutually exclusive**: "Fitness Coaching" (workouts, posture guides, strength protocols, physical fitness coaching) and "Nutrition Coaching" (nutrition plans, food logging guidance, meal coaching, dietary goal tracking). Copy notes selections "can be updated later."
- **Fitness/Credential Verification** (step 2) — three upload slots (Certification Document, Qualification Certificate, **Aadhaar Card for KYC verification** — India-specific ID, front & back), plus text fields for Certification Name, Certifying Body, and Year Obtained. Note: despite the frame name saying "fitness," the KYC/Aadhaar requirement is identity verification, not service-specific — likely this screen (or its fields) repeats per selected service for the credential-specific parts.
- **Verification Status** (step 3, landing) — profile summary header, then a **per-service status card** (e.g. "Fitness Coaching: Verified ✓" / "Nutrition Coaching: Not Verified" with a "Complete Verification" action), an info message explaining partial access ("You can start accepting fitness coaching clients now..."), and a "Go to Dashboard" CTA — confirming a coach can go live on one verified service while another is still pending.

---

## C. Dashboard (3 variants, 1 tab)

All three share: avatar + name + service badge(s) header, a 3-stat row, a "Today's Schedule" list (client name, session type, time), an adherence chart, a "Quick Actions" list, and the 5-tab bottom nav (Dashboard/Clients/Calendar/Messages/More).

- **Fitness-only Dashboard** — stats: Active Clients, Sessions/Wk, Avg Rating. Chart: "Training Adherence (Weekly)." Quick actions: Create Workout Plan, Schedule Client Session, View Progress Reports.
- **Nutrition-only Dashboard** — stats: Active Clients, Consults/Wk, Avg Rating. Chart: "Nutrition Adherence." Quick actions: Create Nutrition Plan, Log Nutrition Adherence, Schedule Consultation.
- **Combined Dashboard** (both services verified) — stats: Total Active, Combined/Wk, Client Rating. Schedule is split into a "Training Sessions" section and a "Nutrition Consultations" section. Quick actions: Create Workout Plan, Create Nutrition Plan, Schedule Client Session.

---

## D. Clients (1 screen, 1 tab destination)

- **Client Profile (Fitness)** — back header, client avatar/meta with relationship status ("Active Coaching Relationship · Fitness Coaching"), a **tab bar: Overview / Training / Recovery / Progress / Notes** (mirrors the consumer app's own module split — a coach sees the same categories of data about a client that the client sees about themself), a "Current Training Program" card (name, focus, week X of Y), a this-week's-workouts checklist (coach can presumably mark/verify completion), and a "Next Scheduled Session" banner.

---

## E. Coach Discovery & Booking (7 screens, user-facing, designed in this file)

**Important:** this is a second design of the same flow that exists differently in the consumer app — see [01-product-requirements.md](01-product-requirements.md) §3 and [07-open-questions-gaps.md](07-open-questions-gaps.md) §1 before treating either version as final.

- **Discovery Filters** — search bar; coach-type chips: **Fitness Coach / Nutrition Professional / Fitness + Nutrition** (a combined-type chip, not seen in the consumer app's version); sort pills (Rating/Price/Availability); a list/grid view toggle; shows a live count ("Showing 24 verified coaches"); "Apply Filters" CTA.
- **Discovery List** — coach row cards: avatar, name, availability status, service badge(s) (e.g. "Fitness Coach ✓", "Nutrition Professional ✓"), specialty tags, rating + review count, languages spoken, and a starting price per session (₹).
- **Coach Profile Detail** — hero photo header with verified-service badges, a 3-stat row (Years Experience, Total Clients, Rating), an About section, a Specializations tag list, an "Available Services" price list (per service type, e.g. Fitness Coaching ₹800/45min, Nutrition Session ₹600/30min, Combined ₹1,200/60min), and a "Book Session" CTA.
- **Booking: Service Selection** — a coach mini-card, radio selection across the coach's service/price options, a date strip, and time-slot chips; "Confirm Booking" CTA.
- **Booking Confirmation** — success state, a session-details card (coach, service, date, time, duration, amount paid), a reminder note, "View My Bookings" and "Back to Home" actions.
- **My Professional Team** — a list of the user's active professional relationships (per professional: status, last/next session date, Message + Book Session actions, a settings gear), plus a "Recommended Professionals" section. **Uses a different bottom nav than every other screen reviewed across all three files — see [02-information-architecture.md](02-information-architecture.md) §4.**
- **Change Professional** — a warning banner clarifying that changing one service's professional doesn't affect other service relationships, the current assigned coach, a reason-for-change radio list (schedule conflicts / different specialization / other personal preferences), and a "Find New [Service] Coach" CTA that presumably routes back into Discovery. This is the user-facing counterpart to the admin console's **Change / Intervention Queue** (04.03) — a change request submitted here is very likely what populates that admin queue for review.
