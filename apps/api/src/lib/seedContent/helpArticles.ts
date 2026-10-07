/**
 * Help articles for Profile & Settings > Help & Support. Each one describes
 * how THIS app behaves today (verified against the code at the time of
 * writing). No medical advice, no promises about timelines we do not control.
 * Idempotent upsert by slug - safe to re-run, content-only.
 */
export type SeedHelpArticle = {
  slug: string;
  category: "getting_started" | "workouts" | "nutrition" | "billing" | "professionals";
  title: string;
  body: string;
  order: number;
};

export const seedHelpArticles: SeedHelpArticle[] = [
  // ---- Getting started ----
  {
    slug: "what-is-23primefit",
    category: "getting_started",
    title: "What is 23PrimeFit?",
    order: 1,
    body:
      "23PrimeFit brings your training, food, recovery and professional support into one app. The bottom tabs are Today (your day at a glance), Train (programs, routines and workouts), Fuel (meals and nutrition), Recover (sleep, devices and guided sessions) and More (profile, settings and support).",
  },
  {
    slug: "set-up-your-plan",
    category: "getting_started",
    title: "How your plan is set up",
    order: 2,
    body:
      "After you sign up, a short onboarding asks about your goals, training level, schedule, equipment and food preferences. Your plan is built from those answers. You can change them later from More > Profile, and your plan updates when you do.",
  },
  {
    slug: "notifications-and-reminders",
    category: "getting_started",
    title: "Turning notifications and reminders on",
    order: 3,
    body:
      "Go to More > Settings > Notifications to choose what you hear about, set quiet hours and an optional daily limit. Reminders for workouts, meals and medicines are scheduled on your device, so they need the system notification permission. If you declined it, open your device settings and allow notifications for 23PrimeFit.",
  },
  {
    slug: "keep-your-account-secure",
    category: "getting_started",
    title: "Keeping your account secure",
    order: 4,
    body:
      "In More > Settings > Security you can change your password, turn on two-factor authentication with an authenticator app, use Face ID or fingerprint to lock the app on this device, and sign out your other devices. If you think someone else has your password, change it right away - doing so signs out every session.",
  },

  // ---- Workouts ----
  {
    slug: "start-a-workout",
    category: "workouts",
    title: "Starting and logging a workout",
    order: 1,
    body:
      "Open Train, pick a program, routine or workout, and tap Start. Log each set with the weight and reps as you go, use the rest timer between sets, and tap Finish when you are done. Finished sessions appear in your progress and history.",
  },
  {
    slug: "swap-an-exercise",
    category: "workouts",
    title: "Swapping an exercise",
    order: 2,
    body:
      "If an exercise does not suit your equipment or how you feel, tap Swap Exercise during your workout to pick an alternative. You can also browse the Exercise Library in Train to see how each movement is done.",
  },
  {
    slug: "workout-reminders",
    category: "workouts",
    title: "Setting workout reminders",
    order: 3,
    body:
      "Under Train > Reminders & Routines you can save reminders for workouts, water and medicines. They are stored on your device and sent as local notifications, so they do not sync between phones.",
  },
  {
    slug: "track-an-activity",
    category: "workouts",
    title: "Tracking a run, walk or ride",
    order: 4,
    body:
      "Use the Activity Tracker in Train to record outdoor activities with your phone's location. Distance, pace and duration are saved with the activity. Location is only used while you are tracking, and only if you allow it.",
  },

  // ---- Nutrition ----
  {
    slug: "log-a-meal",
    category: "nutrition",
    title: "Logging a meal",
    order: 1,
    body:
      "Open Fuel and tap Log food. You can search foods, scan a barcode, snap a photo for an estimate, reuse a saved meal or pick a recent food. Photo estimates are approximate - check the numbers before you confirm.",
  },
  {
    slug: "calorie-and-macro-targets",
    category: "nutrition",
    title: "Where my calorie and macro targets come from",
    order: 2,
    body:
      "Your daily targets come from the answers you gave in onboarding (goal, body details and activity). They are general guidance, not medical advice. If you have a medical condition, talk to a qualified professional before changing how you eat.",
  },
  {
    slug: "meal-plans-and-recipes",
    category: "nutrition",
    title: "Meal plans and recipes",
    order: 3,
    body:
      "Fuel has recipes you can open for ingredients and steps, and a meal plan you can follow day by day. Your food preferences from onboarding shape what is suggested.",
  },
  {
    slug: "log-water",
    category: "nutrition",
    title: "Logging water",
    order: 4,
    body:
      "Use the Water Intake card in Fuel to add glasses through the day. You can also turn on hydration reminders in Settings > Notifications.",
  },

  // ---- Billing ----
  {
    slug: "plans-and-pricing",
    category: "billing",
    title: "Plans and pricing",
    order: 1,
    body:
      "23PrimeFit has Basic (free), Pro and Elite plans, billed monthly or annually. Open More > Subscription to compare what each includes and to subscribe or change plan. Prices are shown in rupees before you pay.",
  },
  {
    slug: "cancel-a-subscription",
    category: "billing",
    title: "Cancelling your subscription",
    order: 2,
    body:
      "In More > Subscription choose Cancel plan. Your plan stays active until the end of the period you already paid for, then it does not renew and you are not charged again.",
  },
  {
    slug: "payment-problems",
    category: "billing",
    title: "A payment did not go through",
    order: 3,
    body:
      "If a payment fails or you were charged but your plan did not change, open a ticket from Help & Support with the category Billing and include the date and amount. Our team will look into it.",
  },
  {
    slug: "buying-a-program",
    category: "billing",
    title: "Buying a program",
    order: 4,
    body:
      "Some programs in Train are sold individually. Open the program, review the details and tap the purchase button. Purchased programs appear under My Programs in Train.",
  },

  // ---- Professionals & refunds ----
  {
    slug: "find-a-professional",
    category: "professionals",
    title: "Finding and booking a professional",
    order: 1,
    body:
      "Open More > Professional Guidance to browse coaches and nutrition professionals, read their profiles and offerings, and request or book a session. A professional works with you once they accept your request.",
  },
  {
    slug: "what-professionals-see",
    category: "professionals",
    title: "What my professional can see",
    order: 2,
    body:
      "Professionals only see your data while you have an active relationship with them, and only after you allow health-data sharing. In More > Settings > Data & Privacy you choose, for each professional, whether they can see your daily steps, food logs and sleep & recovery.",
  },
  {
    slug: "change-or-end-a-professional",
    category: "professionals",
    title: "Changing your professional",
    order: 3,
    body:
      "You can ask to change your professional from My Professional Team. Changing one service does not affect your other service relationships. Your request is reviewed rather than applied instantly.",
  },
  {
    slug: "refunds-and-disputes",
    category: "professionals",
    title: "Refunds for sessions or services",
    order: 4,
    body:
      "Refunds for professional services are reviewed by our team case by case. Open a ticket from Help & Support with the category Billing, name the professional and the date of the session, and explain what happened.",
  },
];
