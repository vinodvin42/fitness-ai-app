# Screen Inventory — Mobile App

All 82 screens are 390×844 iOS frames on a single Figma page. Node IDs are in [../../figma-reference/user-mobile.md](../../figma-reference/user-mobile.md). Layer names quoted below were read directly from the Figma structure, not guessed.

---

## A. Onboarding & Auth (8 screens)

A linear, no-back-nav-bar flow with a 5-step progress indicator from step 3 onward.

- **Splash/Welcome** — logo animation area, "23PrimeFit — Your Complete Wellness Operating System" tagline, "Get Started" primary CTA, "Sign In" link for returning users.
- **Login/Register** — a Login/Sign Up mode toggle; sign-up form: full name, phone number (+91 default, OTP-based), optional recovery email, terms/privacy checkbox, "Get OTP" CTA.
- **OTP Verification** — 4-digit OTP box entry, resend timer, "Verify" CTA.
- **Setup: About You** — gender selection cards (male/female/other), and stepper inputs for age/weight/height.
- **Setup: Goals** — a multi-select chip grid: Lose Weight, Build Muscle, Improve Endurance, Stay Active, Increase Flexibility, Better Sleep, Reduce Stress, Sports Performance.
- **Setup: Training Level** — a stack of experience-level cards (beginner/intermediate/advanced-style, 4 options).
- **Setup: Food/Diet** — a horizontal diet-type scroller (6 options, e.g. veg/non-veg/vegan style) plus a multi-select allergen chip grid (9 options).
- **Setup: Safety** — a medical-conditions scroller (a "none" option plus 6 conditions) and an injuries chip grid (6 options) — feeds into training/nutrition personalization and is a health-data collection point worth flagging for privacy review.

---

## B. Today / Home (5 screens)

- **Today (Home Dashboard)** — the primary landing screen: profile header with greeting + avatar; search and notification bell; an "AI Daily Brief" card (dismissible); a **Readiness Score** ring (contributing factors: Sleep, HRV, Stress) with a link to detail; "Today's Training" card with an AI recommendation and Start/Details actions; a nutrition snapshot card with an AI suggestion and Log/Recipes actions; a hydration snapshot with a quick-add-glass control; a "Recovery Action" card with Accept/Why actions (mirrors the active-workout AI override pattern — the AI proposes an action, the user can accept or ask why).
- **Notifications** — filterable (All/Workouts/Nutrition) grouped-by-day list.
- **Search** — global search bar with mic input, recent-search chips, browse-by-category (Workouts, Recipes, Coaches), and a trending section.
- **Schedule** — a 7-day date strip with a chronological timeline of the day's items (e.g. "Morning Stretch", "Upper Body Workout", "Meal Prep Reminder", "Evening Run"), plus an add button.
- **More Menu** (`user-more-menu`) — the tab's landing hub: profile badge, a premium upsell banner, and a menu list routing to Schedule, Progress (trending-up icon), Body/Weight (scale icon), Reminders (clock icon), Profile (user icon), Notifications (bell icon), and Support (book-open icon).

---

## C. Training (16 screens) — the largest module

Shares consistent chrome: a settings gear, a location toggle (Gym/Home), and an AI Coach FAB on nearly every screen.

- **Train Dashboard** (`trn-01`) — an AI brief card, "Today's Workout" card (with duration/exercise-count/intensity meta and a breakdown: mobility & warm-up, strength training, cardio finisher, cooldown & stretch) and Start Workout CTA, a "Quick Start" row (Quick HIIT, Stretch & Flow, Core Blast — short sessions), and an "Active Programs" progress card.
- **Training Programs** (`trn-02`) — a program marketplace: filter carousel, a featured section, and a program grid with price, an "AI" tag, a CTA, and a free-preview option — plus an AI footer recommendation.
- **Program Detail** (`trn-03`) — hero image, progress section, workouts list, program notes; a **commerce section** with pricing, an "Add Coach" toggle (bundling a human coach onto an AI program), a "how it works" weekly breakdown (Weeks 1-2, 3-4, 5-8, 9-12), a "what you receive" benefits checklist, and a premium CTA.
- **Workout Detail** (`trn-04`) — summary, an AI note, and accordion-style exercise phases; leads into Active Workout.
- **Exercise Library** (`trn-05`) — search + filters (body part, equipment) over a list of exercises.
- **Exercise Detail** (`trn-06`) — a video player, scrollable instructions, and an "alternatives" section.
- **Active Workout** (`trn-07`) — the most complex screen: a live workout-status header with phase pill and pause control, a heart-rate banner, an **AI banner with Why/Override actions**, a Gym/Home mode toggle, the active exercise card with logged-sets history and a weight/reps input row plus a checkmark to log a set, an RPE (perceived exertion) slider, a rest-timer overlay with a ring countdown, and an "up next" list.
- **Set/Rest Tracker** (`trn-08`) — a focused single-purpose view: large weight/reps displays, warm-up/drop-set toggles, an RPE scale, a big rest-timer ring with presets, a note field, and set history table.
- **Exercise Swap** (`trn-09`) — reason chips for swapping, equipment filters, an **"AI Pick" section** with a dedicated "Swap with AI" action, and a list of smart alternatives.
- **Workout Complete** (`trn-10`) — a streak badge, quick stats, a personal-records section, a heart-rate distribution chart, a phase breakdown, and an AI insight.
- **Workout History** (`trn-11`) — search, filters, a monthly stats summary, a calendar heatmap, and a chronological history list, with a "compare" action.
- **Training Analytics** (`trn-12`) — a time-range selector, a volume-trend chart, an ACWR (acute:chronic workload ratio — a real sports-science metric) card, a muscle-group distribution chart, and AI advice.
- **My Routines** — a filterable list of saved routines with a schedule row and a reminder/notification toggle per routine.
- **Running Tracker** — live GPS map, run telemetry tiles, a live heart-rate zone display, a splits list, an audio coaching-cue toggle, and stop/pause/lock controls.
- **Cycling Tracker** — the cycling equivalent: speed/distance/elevation and cadence/power tiles, heart-rate zones, and the same stop/pause/lock controls.
- **Workout Settings** — sliders and toggles for workout preferences, a kg/lbs unit switch, an equipment chip selector, and a day-of-week availability picker.

---

## D. Nutrition ("Fuel") (7 screens)

- **Nutrition Dashboard** — a calorie ring (consumed of goal) with macro bars (Protein/Carbs/Fat), a meal timeline (Breakfast/Lunch/Dinner, each showing logged time and kcal or a "tap to add" empty state), a water-intake tracker (glasses toward a goal), and a Log Meal FAB alongside the AI Coach FAB.
- **Log Meal** — search with a barcode-scan shortcut, a "take photo" option (implies AI photo-based food logging, matching the admin's "PrimeVision Photo Diet Log" AI feature), a recent-foods list with quick-add, saved/favorited meals, and a manual macro-entry card (Carbs/Protein/Fat inputs).
- **Barcode Scanner** — a live camera viewport with frame-corner targeting, and a bottom sheet showing the scanned product's macros with an Add action.
- **Recipes** — filterable recipe grid with rating stars.
- **Recipe Detail** — hero image, macro chips (calories/protein/carbs), a checkable ingredients list, numbered steps, and a "Log" action to add it to today's intake.
- **Meal Plan** — a 7-day tab strip, an AI banner (AI-generated plan), and a daily meals list with labeled tags.
- **Nutrition Calendar** — a full month grid (day cells colored/badged by compliance), selected-day detail stats, a compliance card, and monthly summary stats.

---

## E. Recovery & Devices (5 screens)

- **Recovery Dashboard** — a Recovery Score (e.g. "78/100 — Good Recovery") derived from sleep/HRV/resting-HR per the on-screen copy, key-metric tiles (Sleep, HRV, Resting HR), a Stress level indicator, an activity summary (steps, active calories, active minutes), an AI Recovery Insight card, and a wearable sync status line (e.g. "Apple Watch · Synced").
- **Connected Devices Hub** — sync-status pills, a list of active devices (each with battery level and a re-sync action) and available-platform integrations (heart-rate, activity, GPS-style icons suggest Apple Health/Google Fit style platform connections in addition to individual devices).
- **Add Device** — search + filter over device categories: Smartwatches, Fitness Bands, Activity Trackers, Smart Scales, Other Devices.
- **Device Pairing** — a Bluetooth scanning animation, discovered-device cards with signal strength and a Pair action, and a **granular permissions list**: Steps & Distance, Heart Rate (continuous), Sleep Tracking, Blood Oxygen (SpO2), Stress Level, Workout Auto-Detect — each independently toggleable.
- **Sync Dashboard** — an overall sync summary with a "Sync All" action, a progress ring, and a per-data-stream sync status list.

---

## F. Progress & Body (7 screens)

- **Progress Overview** — overall-progress ring toward a goal, a body-weight sparkline chart, a measurements grid (with up/down trend arrows), a personal-records list (trophy icon), and a link to a transformation-photo gallery.
- **Body Composition** — a body silhouette hero visual, key stats, a trends chart, and a wearable-sync card.
- **Body Measurements** — a body-diagram visual for logging/viewing measurements at specific points.
- **Log Measurements** — a data-entry form (paired with the above).
- **Streak Tracker** — a "fire" streak banner, a grid heatmap (calendar-style), and a per-category streak list (training, nutrition/salad icon, mindfulness/brain icon, hydration/water-glass icon) — i.e. streaks are tracked per habit type, not just one overall streak.
- **Progress Photos** — a before/after slider comparison, take-photo and upload actions, and a photo grid/gallery.
- **AI Insights** — a "core prediction" card with a progress bar and a plateau warning, a forecast row, a "recover" row, and an anomalies list — the most explicitly predictive-AI screen in the app.

---

## G. Timeline (4 screens)

A "premium" life/fitness journey log — headers are tagged `premium-header`, suggesting this may be a paid-tier feature (cross-check against the Elite/Pro feature comparison — "Progress Tracking" is listed as Advanced on Pro/Elite only).

- **Timeline Overview** — a year selector (2024/2025), a stats ribbon, a legend, and a scrollable timeline spine of dated milestone entries (from the screenshot sample: a marathon PR, a bench-press PR, a goal weight reached, a VO2 max improvement, a 100-workouts milestone) each tagged with a badge (PR / Milestone / Goal Reached).
- **Timeline Month** — a calendar-row view of one month with data badges per day and a "coach comment" element (implying a human coach can annotate a user's timeline).
- **Timeline Event** — detail view of a single timeline entry with a progress track.
- **Timeline Report** — a report/summary rollup of timeline data.

---

## H. AI Coach (1 screen)

- **AI Coach Chat** (branded "23Prime AI") — an online-status header, guidance-topic chips (Training Plan, Exercise Form, Nutrition Advice, Recovery — truncated list, likely more), a message thread (user bubbles + AI bubbles with avatar), quick-reply suggestion chips below the thread, and a composer with attach/mic/send. Carries an explicit disclaimer: *"AI Coach provides general fitness and wellness guidance only. Not a substitute for professional medical advice."*

---

## I. Programs Commerce (4 screens)

- **Program Purchase** — program preview, a plan choice (**AI Program** vs. **AI + Coach**, priced independently, e.g. ₹1,299 vs ₹1,799 in the sample), a coupon/partner-code field, a price breakdown, and a payment-method section (UPI/card/net banking icons) with a secure-payment badge.
- **Program Progress** — program meta, a progress-circle, adherence cards, a timeline, and an AI insight, with an AI Coach FAB relabeled as a "coach-fab."
- **Program Completion** — a celebration state (award icon), completion metrics, milestones, and an AI recommendation for what's next.
- **My Programs** — a list of active vs. completed programs (with progress/streak indicators and a trophy for completed ones) and a "browse more" CTA.

---

## J. Coaching Marketplace (4 screens)

- **Find a Coach** — search + specialty filter pills (All/Fitness/Nutrition/Yoga/Sports), and a coach list (photo, name, specialty, rating, active-client count, price per session in ₹).
- **Coach Booking** — coach profile header with a verified badge, stats, specialty tags, bio, a 7-day availability calendar, and session-package pricing cards (e.g. single session vs. multi-session packs) with a Book action.
- **Coach Messaging** — a direct-message thread with a coach: text bubbles, a shared video card (coach sending a form-check video), a shared plan card (coach sending a workout plan inline), a typing indicator, and call/video-call header actions.
- **Coach Session Summary** — a post-session recap with location, duration, and a rating prompt.

---

## K. Reminders (1 screen)

- **Add Reminder** — category chips, meal-timing presets, a time picker with AM/PM toggle, repeat-preset options, a day-of-week selector, and an alarm-sound toggle.

---

## L. Settings (6 screens)

- **Language Selection** — a searchable grid of **10 languages** (English, Hindi, Tamil, Telugu, Kannada, Marathi, Bengali, Gujarati, Malayalam, Punjabi) with radio selection.
- **Health Connect Settings** — connected-watch card with battery/sync status, a permissions list, and a "pair another device" action (overlaps with the Recovery module's device flows — see [07-open-questions-gaps.md](07-open-questions-gaps.md)).
- **Notification Settings** — a master toggle banner plus grouped, individually toggleable notification categories (at least 6 rows) and two "advanced" rows.
- **Security** — password change, two-factor authentication toggle, biometric-login toggle, an active-sessions list (phone/laptop/tablet icons — implying multi-device session management), and privacy actions (download my data, delete account).
- **Support** — a help search bar, quick-contact options (chat, email), an FAQ list, a support-tickets list, and report-a-bug / feature-request actions, plus an app-version footer.
- **Data & Privacy** — a privacy info banner, data-sharing toggles, GDPR-style actions (download data, delete account).

---

## M. Subscription & Payments (7 screens)

- **Subscription Plans** — a Monthly/Annual billing switch (with an "annual saves X%" badge), three plan cards (**Basic** free / **Premium Pro** ₹299/mo, most popular / **Elite Coach** ₹2,999/mo), and an expandable **feature-comparison table** across Free/Pro/Elite for: Fitness Programs, AI Nutrition, AI Training, Routines, Health Dashboard, Progress Tracking, Coach, Direct Messaging.
- **Payment Checkout** — plan summary, quick-payment row (Apple Pay/Google Pay), a full card-entry form (number/expiry/CVC), a promo-code field, a price breakdown (subtotal/discount/tax/total), a Subscribe action, and security badges (SSL/PCI).
- **Payment Success** — a celebratory confirmation with an invoice summary and a benefits-unlocked list.
- **Payment Failed** — an error state with a "try again" and "different payment method" action.
- **Subscription Management** — current plan card, a benefits list, and a management actions panel (implies upgrade/downgrade/pause here).
- **Purchase History** — a filterable transaction list.
- **Subscription Cancel** — a cancellation flow (retention-warning styling implied by an alert-triangle icon).

---

## N. Profile & Preferences (6 screens)

- **Profile** — avatar with an edit overlay, a "Premium Pro" badge, subscription status card (current plan, days remaining, a progress bar), an "Invite Friends" card, and a quick-links menu (Account Settings, My Goals, My Programs, Saved Recipes, Connected Devices, Subscription, Data & Privacy, Security, Privacy Policy, Terms of Service, Help & Support) plus Log Out.
- **View/Edit Profile** — an editable form: full name, date of birth, mobile number, gender, height, weight.
- **Preferences** — dark-mode toggle, accent-color picker link, unit system, language link, notification and sound toggles, and lock/privacy shortcuts.
- **Membership Details** — plan status card, start/end dates, a remaining-time progress bar, pause/upgrade actions, and an info list (payment method, billing history, auto-renewal toggle, cancel).
- **Measurement Units** — a segmented metric/imperial control.
- **Accent Colour** — a theme accent-color picker (sample options: Green/Yellow/Red) with a live preview card.

---

## O. Referral (1 screen)

- **Refer & Invite** — a "you get / friend gets" rewards grid, a shareable referral code with copy action, social-share shortcuts (Messages, Instagram, Mail, more), a "how it works" step timeline, referral stats (invited/joined/earned), and a sticky bottom Share CTA.
