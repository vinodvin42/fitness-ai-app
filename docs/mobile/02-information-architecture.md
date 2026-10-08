# Information Architecture — Mobile App

## 1. Navigation shell

**Onboarding** (splash → login/register → OTP → a 5-step setup wizard: About You → Goals → Training level → Food/diet → Safety/injuries, each with a progress bar and step label) is a linear flow with no bottom nav, ending on the Today home screen.

**Post-onboarding**, a persistent **5-tab bottom bar** appears on effectively every screen: **Today, Train, Fuel, Recover, More**. ("More" is itself a hub screen, not a 6th top-level module — see §3.) An **AI Coach floating action button** floats above the tab bar on most Train/Fuel/Recover/Progress screens, opening the AI chat from anywhere.

Most screens also share: an iOS status bar (time/signal/wifi/battery — a design artifact, not app UI), a back-button + title header on drill-in screens, and a home-indicator bar at the bottom (iOS gesture-nav convention).

## 2. The five tabs

1. **Today** — the home dashboard: AI daily brief, readiness score (sleep/HRV/stress ring), today's training card, nutrition snapshot, hydration tracker, and a recovery action card. Also reachable from Today: Notifications, Search, Schedule.
2. **Train** — the entire Training module (see §3), the largest single area of the app.
3. **Fuel** — Nutrition: dashboard, meal logging, barcode scanner, recipes, AI meal plan, nutrition calendar.
4. **Recover** — Recovery dashboard + the wearable device hub (add device, pairing, sync).
5. **More** — a catch-all menu surfacing: Progress & Body, Timeline, Programs, Coaching, Profile, Settings, Subscription, and Referral — i.e. everything that doesn't fit in the four primary daily-use tabs.

## 3. Full sitemap

```mermaid
flowchart LR
    Root["FynroX App"]

    Root --> OB["Onboarding & Auth"]
    OB --> OB1["Splash/Welcome"] --> OB2["Login/Register"] --> OB3["OTP Verification"] --> OB4["Setup: About You"] --> OB5["Setup: Goals"] --> OB6["Setup: Training Level"] --> OB7["Setup: Food/Diet"] --> OB8["Setup: Safety/Injuries"]

    Root --> Today["Today (tab)"]
    Today --> T1["Home Dashboard"]
    Today --> T2["Notifications"]
    Today --> T3["Search"]
    Today --> T4["Schedule"]

    Root --> Train["Train (tab)"]
    Train --> TR1["Train Dashboard"]
    Train --> TR2["Training Programs (marketplace)"] --> TR3["Program Detail"] --> TR4["Workout Detail"]
    Train --> TR5["Exercise Library"] --> TR6["Exercise Detail"]
    TR4 --> TR7["Active Workout"] --> TR8["Set/Rest Tracker"]
    TR7 --> TR9["Exercise Swap (AI)"]
    TR7 --> TR10["Workout Complete"]
    Train --> TR11["Workout History"]
    Train --> TR12["Training Analytics"]
    Train --> TR13["My Routines"]
    Train --> TR14["Running Tracker (GPS)"]
    Train --> TR15["Cycling Tracker (GPS)"]
    Train --> TR16["Workout Settings"]

    Root --> Fuel["Fuel (tab)"]
    Fuel --> F1["Nutrition Dashboard"]
    F1 --> F2["Log Meal"] --> F3["Barcode Scanner"]
    Fuel --> F4["Recipes"] --> F5["Recipe Detail"]
    Fuel --> F6["Meal Plan (AI)"]
    Fuel --> F7["Nutrition Calendar"]

    Root --> Recover["Recover (tab)"]
    Recover --> R1["Recovery Dashboard"]
    Recover --> R2["Connected Devices Hub"] --> R3["Add Device"] --> R4["Device Pairing"]
    R2 --> R5["Sync Dashboard"]

    Root --> More["More (tab)"]
    More --> P1["Progress Overview"]
    P1 --> P2["Body Composition"]
    P1 --> P3["Body Measurements"] --> P4["Log Measurements"]
    P1 --> P5["Streak Tracker"]
    P1 --> P6["Progress Photos"]
    P1 --> P7["AI Insights"]
    More --> TL1["Timeline Overview"] --> TL2["Timeline Month"] --> TL3["Timeline Event"]
    TL1 --> TL4["Timeline Report"]
    More --> PR1["My Programs"]
    PR1 --> PR2["Program Purchase"] --> PR3["Program Progress"] --> PR4["Program Completion"]
    More --> C1["Find a Coach"] --> C2["Coach Booking"]
    C2 --> C3["Coach Messaging"] --> C4["Coach Session Summary"]
    More --> Rem["Add Reminder"]
    More --> Prof["Profile"] --> ProfV["View/Edit Profile"]
    Prof --> Pref["Preferences (theme, accent color, units, language)"]
    Prof --> Mem["Membership Details"]
    Prof --> Ref["Refer & Invite"]
    More --> Set["Settings"]
    Set --> S1["Language Selection"]
    Set --> S2["Health Connect Settings"]
    Set --> S3["Notification Settings"]
    Set --> S4["Security (2FA/biometrics/sessions)"]
    Set --> S5["Support & Help"]
    Set --> S6["Data & Privacy"]
    More --> Sub["Subscription"]
    Sub --> Sub1["Subscription Plans"] --> Sub2["Payment Checkout"]
    Sub2 --> Sub3["Payment Success"]
    Sub2 --> Sub4["Payment Failed"]
    Sub --> Sub5["Subscription Management"]
    Sub --> Sub6["Purchase History"]
    Sub --> Sub7["Subscription Cancel"]

    AICoach["AI Coach Chat (floating, global)"]
    Train -.-> AICoach
    Fuel -.-> AICoach
    Recover -.-> AICoach
    More -.-> AICoach
```

82 leaf screens across 15 functional groups — full detail in [03-screen-inventory.md](03-screen-inventory.md).

## 4. Cross-links worth noting

- **Today → everything.** The home dashboard's cards (training, nutrition, hydration, recovery) deep-link into Train/Fuel/Recover directly, mirroring the Admin Dashboard's "quick link" pattern in the other app.
- **Active Workout → Exercise Swap / Set-Rest Tracker.** A workout in progress can branch into either an AI-assisted exercise swap or a focused rest-timer view without leaving the workout session.
- **Program Detail → Program Purchase → Program Progress → Program Completion** is a clean linear commerce+fulfillment funnel.
- **Find Coach → Coach Booking → Coach Messaging → Session Summary** mirrors the program funnel but for human coaching.
- **Profile → Membership Details / Subscription** and **Subscription Plans → Payment Checkout → Success/Failed** are the monetization backbone, independent of (but cross-linked from) Profile.
