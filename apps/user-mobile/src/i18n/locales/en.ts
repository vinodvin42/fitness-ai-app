/**
 * English source catalogue — the single place user-facing copy lives.
 *
 * Keys are `screen.element`, matching the screen's own file name, so the
 * string for a given piece of UI is findable from the component and vice
 * versa. Nested rather than flat because a flat file of several hundred
 * dotted keys is unreadable by the translators who actually work in it.
 *
 * Interpolation uses i18next's `{{name}}` syntax. Pluralisation uses its
 * `_one` / `_other` suffixes, which resolve through CLDR rules per
 * language — that is precisely why this is a library rather than a
 * hand-rolled lookup: Hindi, Tamil and Bengali do not pluralise the way
 * English does, and a homegrown layer gets that wrong silently.
 */
export const en = {
  common: {
    retry: "Try again",
    cancel: "Cancel",
    save: "Save",
    done: "Done",
    open: "Open",
    // `loading` was removed on 29 Sep 2026: nothing in the app renders a
    // loading *word* — every loading state is an ActivityIndicator — so
    // it was copy written ahead of a screen that never wanted it. Nine
    // translators would have been paid to translate a string no user can
    // ever see.
    somethingWentWrong: "Something went wrong",
    checkConnection: "Check your connection and try again.",
  },

  nav: {
    today: "Today",
    train: "Train",
    fuel: "Fuel",
    recover: "Recover",
    more: "More",
  },

  today: {
    progressCard: {
      title: "Progress",
      subtitle: "Measurements, photos and your weekly check-in",
    },
    quickLinks: "Quick links",
    aiCoachReady: "Your AI Coach is ready",
    planError: "Couldn't load your plan for today.",
    hydrationError: "Couldn't load today's hydration.",
    continueWorkout: "Continue Workout",
    resumeSession: "Resume session",
    todaysPlan: "Today's Plan",
    startWorkout: "Start Workout",
  },

  more: {
    title: "More",
    logOut: "Log out",
    rows: {
      settings: { label: "Settings", subtitle: "Account, security, language" },
      progress: { label: "Progress", subtitle: "Measurements, photos & check-ins" },
      timeline: { label: "Timeline", subtitle: "Milestones & PRs" },
      coaching: { label: "Coaching", subtitle: "Request, status & your team" },
      subscription: { label: "Subscription", subtitle: "Plan & payments" },
      purchases: { label: "Purchases", subtitle: "Receipts & refund status" },
      reminders: { label: "Reminders", subtitle: "Workout, meal & water nudges" },
      referral: { label: "Refer & Invite", subtitle: "Earn free months" },
    },
  },

  /**
   * The signed-out flow. Migrated 29 Sep 2026 — first because it is the
   * only part of the app a user sees BEFORE their `languagePreference`
   * has been loaded, and because it is where someone who cannot read
   * English gives up.
   */
  auth: {
    login: {
      title: "Welcome back",
      subtitle: "Log in to continue your training.",
      email: "Email",
      password: "Password",
      submit: "Log In",
      forgot: "Forgot password?",
      createAccount: "Create an account",
    },
    splash: {
      tagline: "Your complete wellness operating system",
      getStarted: "Get Started",
      signIn: "Sign In",
    },
    twoFactor: {
      title: "Two-factor authentication",
      subtitle: "Enter the 6-digit code from your authenticator app, or one of your recovery codes.",
      code: "Code",
      submit: "Verify",
      backToLogin: "Back to Login",
    },
    signup: {
      title: "Create your account",
      subtitle: "Start your fitness journey with FynroX.",
      fullName: "Full name",
      email: "Email",
      password: "Password (min. 8 characters)",
      passwordA11y: "Password, minimum 8 characters",
      referral: "Referral code (optional)",
      referralA11y: "Referral code, optional",
      submit: "Create Account",
      haveAccount: "Already have an account? Log in",
    },
    forgot: {
      title: "Forgot password?",
      subtitle: "Enter your email and we'll send you a link to reset it.",
      email: "Email",
      submit: "Send Reset Link",
      backToLogin: "Back to Login",
      sentTitle: "Check your email",
      // Deliberately does not confirm whether the address has an account
      // — that would make this screen an account-enumeration oracle.
      sent: "If an account exists for {{email}}, we've sent a link to reset your password. It expires in 30 minutes.",
      notSent:
        "Your request was recorded, but we couldn't send the email right now. Please try again shortly or contact support.",
    },
    reset: {
      title: "Set a new password",
      subtitle: "Choose a new password for your account.",
      password: "New password (min. 8 characters)",
      passwordA11y: "New password, minimum 8 characters",
      confirm: "Confirm new password",
      confirmA11y: "Confirm new password",
      submit: "Reset Password",
      mismatch: "Passwords don't match.",
      backToLogin: "Back to Login",
    },
  },

  profile: {
    title: "Profile",
    memberSince: "Member since {{date}}",
    subscription: "Subscription",
    subscriptionError: "Couldn't load your subscription.",
    renews: "Renews {{date}}",
    manage: "Manage Subscription",
    none: "No active subscription.",
    viewPlans: "View Plans",
    invite: "Invite Friends",
    referralError: "Couldn't load your referral code.",
    yourCode: "Your code",
    // A real CLDR plural, not `count === 1 ? "" : "s"`. That branch is
    // correct in English and wrong in most of the ten languages this app
    // offers — and wrong silently, which is the whole reason i18next is
    // here rather than a lookup object.
    signups_one: "{{count}} signup so far.",
    signups_other: "{{count}} signups so far.",
    editProfile: "Edit Profile",
    preferences: "Preferences",
  },

  /** Subscription — plans, billing cycle, and the entitlement state. */
  subscription: {
    title: "Subscription",
    cancel: "Cancel Subscription",
    monthly: "Monthly",
    annual: "Annual",
    popular: "Popular",
    save: "Save {{percent}}%",
    unlock: "Unlock your full potential",
    choosePlan: "Choose a plan to get started.",
    haveCoupon: "Have a coupon?",
    enterCode: "Enter code",
    couponNote: "Applied at checkout for paid plans. An invalid code will stop the order.",
    purchaseHistory: "Purchase History",
    comparePlans: "Compare plans",
    feature: "Feature",
    comingSoon: "Coming soon",
    switch: "Switch",
    choose: "Choose",
    // Plan TIER names (Basic / Pro / Elite) are deliberately absent: they
    // are product names, like FynroX itself, and translating them would
    // make a user's plan unrecognisable against their receipt.
    features: {
      tracking: "Workout & nutrition tracking",
      progress: "Progress & timeline",
      aiCoach: "AI Coach chat",
      recovery: "Recovery log",
      humanCoaching: "1-on-1 human coaching",
      prioritySupport: "Priority support",
    },
  },

  /** Daily and weekly check-ins. */
  checkIn: {
    title: "Check-In",
    subtitle: "How's it going?",
    daily: "Daily",
    weekly: "Weekly",
    energy: "Energy",
    soreness: "Soreness",
    adherence: "Adherence to plan",
    note: "Note (optional)",
    notePlaceholder: "Anything worth noting?",
    submitDaily: "Check In for Today",
    submitWeekly: "Check In for This Week",
    recent: "Recent check-ins",
  },

  /** Coaching — discovery, bookings, messages and the relationship. */
  coaching: {
    title: "Coaching",
    subtitle: "Request guidance and track your professional relationship",
    team: {
      title: "My Professional Team",
      emptyTitle: "No coaches yet",
      emptySubtitle: "Book a session with a coach and they'll show up here.",
      findCoach: "Find a Coach",
      bookSession: "Book Session",
      message: "Message",
      change: "Change",
      viewProfile: "View Profile",
      allMessages: "All messages ›",
      recommended: "Recommended Professionals",
    },
    discovery: {
      search: "Search coaches",
      mostExperienced: "Most experienced",
      lowestPrice: "Lowest price",
      findTeam: "Find My Professional Team",
      loading: "Loading coaches…",
      emptyTitle: "No verified coaches yet",
      emptySubtitle: "Check back soon, or try a different filter.",
    },
    profile: {
      title: "Coach Profile",
      yearsExp: "Years exp.",
      clients: "Clients",
      services: "Available Services",
      noServices: "No priced services listed yet.",
    },
    booking: {
      selectTitle: "Book a Session",
      chooseService: "Choose a service",
      chooseDate: "Choose a date",
      chooseTime: "Choose a time",
      couponPlaceholder: "Have a coupon? Enter code",
      confirmedTitle: "Booking Confirmed",
      booked: "Booked ✓",
      coach: "Coach",
      service: "Service",
      dateTime: "Date & Time",
      duration: "Duration",
      amount: "Amount",
      viewBookings: "View My Bookings",
      backHome: "Back to Home",
    },
    relationship: {
      emptyTitle: "No professional relationship yet",
      emptySubtitle: "Request guidance from a verified fitness or nutrition professional to get started.",
      yourRequest: "Your Request",
      viewTeam: "View My Professional Team",
      serviceFitness: "Fitness Coaching",
      serviceNutrition: "Nutrition Coaching",
      // §10's relationship lifecycle, as the progress stepper renders it.
      step: {
        requested: "Requested",
        accepted: "Accepted",
        awaiting_payment: "Awaiting Payment",
        activating: "Activating",
        active: "Active",
      },
      // The same states as a sentence the user reads, which is a
      // different string from the stepper's one-word label.
      status: {
        requested: "Waiting for the coach to respond",
        accepted: "Accepted — set up your payment to continue",
        awaiting_payment: "Awaiting payment",
        activating: "Activating your relationship…",
        active: "Active",
      },
      requestedNote:
        "Nothing's wrong — the coach hasn't reviewed your request yet. You'll be able to continue as soon as they accept.",
      notActiveNote: "Not an active professional relationship yet — full access unlocks once this reaches Active.",
      continueToPayment: "Continue to Payment",
    },
    change: {
      title: "Change Professional",
      headsUp: "Heads up",
      current: "Current professional",
      why: "Why are you changing professionals?",
      tellUsMore: "Tell us more (optional)",
    },
    messages: {
      title: "Messages",
      emptyTitle: "No conversations yet",
      emptySubtitle: "Once you have a coach, you can message each other here.",
      placeholder: "Message…",
      send: "Send",
    },
    requests: {
      emptyTitle: "No requests yet",
      emptySubtitle: "Ask for guidance and we'll match you with a professional.",
    },
  },

  /** Settings — Security & Privacy and the screens around it. */
  security: {
    title: "Security & Privacy",
    changePassword: "Change Password",
    currentPassword: "Current password",
    newPassword: "New password (min. 8 characters)",
    confirmNewPassword: "Confirm new password",
    password: "Password",
    twoFactor: {
      title: "Two-Factor Authentication",
      pitch: "Add a second step at login using an authenticator app — even if your password leaks, your account stays protected.",
      setUp: "Set Up",
      scan: "Scan this with your authenticator app (Google Authenticator, Authy, 1Password, etc.), then enter the 6-digit code it shows.",
      cantScan: "Can't scan it? Enter this code manually:",
      copy: "Copy",
      code: "6-digit code",
      enable: "Enable",
      recoveryCodes:
        "Two-factor authentication is on. Save these recovery codes somewhere safe — each works once, and this is the only time they'll be shown.",
      copyCodes: "Copy Codes",
      on: "Two-factor authentication is on — logins need a code from your authenticator app. Enter your password to turn it off.",
      turnOff: "Turn Off",
    },
    sessions: {
      title: "Active Sessions",
      empty: "No active sessions",
      signOut: "Sign Out",
    },
    biometric: {
      title: "Biometric Unlock",
      checking: "Checking this device…",
      ready: "Require Face ID or Touch ID to open the app after it's been backgrounded.",
      unavailable: "No Face ID or Touch ID is set up on this device.",
      lockAfter: "Lock after being backgrounded for",
      immediately: "Immediately",
      minutes: "{{count}} min",
    },
    data: {
      title: "Data & Privacy",
      body: "Download everything this app has stored about you — profile, workouts, meals, measurements, purchases, and reminders — as JSON.",
      download: "Download My Data",
    },
    deleteAccount: {
      title: "Delete Account",
      body: "Permanently deletes your account and everything in it. Enter your password to confirm.",
      submit: "Delete Account",
    },
  },

  reminders: {
    label: "Label",
    labelPlaceholder: "e.g. Drink water",
    hour: "Hour",
    minute: "Minute",
    am: "AM",
    pm: "PM",
    repeat: "Repeat",
    everyDay: "Every day",
    weekdays: "Weekdays",
    weekends: "Weekends",
    playSound: "Play sound",
    delete: "Delete Reminder",
  },

  editProfile: {
    title: "Edit Profile",
    fullName: "Full name",
    mobile: "Mobile number",
    aboutYou: "About You",
    aboutYouError: "Couldn't load gender/age/height/weight.",
  },

  photos: {
    title: "Progress Photos",
    take: "Take Photo",
    upload: "Upload Photo",
    emptyTitle: "No progress photos yet",
    emptySubtitle: "Take or upload one to start tracking your transformation.",
    beforeAfter: "Before / After",
    close: "Close",
    delete: "Delete",
  },

  referral: {
    title: "Refer & Invite",
    yourCode: "Your referral code",
    share: "Share",
    signups: "Signups",
    monthsEarned: "Months earned",
    rewards: "Rewards",
    youGet: "You get",
    youGetValue: "1 month free",
    youGetWhen: "when your friend subscribes to a paid plan",
    friendGets: "Your friend gets",
    friendGetsValue: "Your referral credit",
    friendGetsWhen: "toward their membership",
    // CLDR plural, not `reward{n === 1 ? "" : "s"}`.
    earned_one: "You've earned {{count}} reward so far. Credit is applied toward your next renewal.",
    earned_other: "You've earned {{count}} rewards so far. Credit is applied toward your next renewal.",
    howItWorks: "How it works",
    step1: "Share your code with a friend.",
    step2: "They enter it on the Sign Up screen when they create their account.",
    step3: "It shows up here as a real, counted signup.",
  },

  support: {
    title: "Support",
    search: "Search help articles",
    emailTitle: "Email Support",
    myTickets: "My Tickets",
    noTickets: "No tickets yet",
    noTicketsSubtitle: "Run into a bug or have a question? Open a new ticket.",
    newTicket: "New Ticket",
  },

  settings: {
    title: "Settings",
    healthConnect: "Health Connect",
    healthConnectNote: "Wearable sync needs a native Bluetooth/HealthKit integration this build can't do yet.",
    preferences: "Preferences",
    unitSystem: "Unit System",
    accentColor: "Accent Color",
    notifications: "Notifications",
    reminderNotifications: "Reminder notifications",
    manageReminders: "Manage Reminders",
    privacy: "Privacy & Consent",
    savePreferenceFailed: "Couldn't save that preference. Check your connection and try again.",
    language: "Language",
    searchLanguages: "Search languages",
  },

  remindersList: {
    title: "Reminders",
    add: "+ Add Reminder",
    emptyTitle: "No reminders yet",
    emptySubtitle: "Add one for workouts, meals, water, or measurements.",
  },

  measurements: {
    logTitle: "Log Measurement",
    historyTitle: "Measurement History",
    emptyTitle: "No measurements logged yet",
    emptySubtitle: "Log your weight and body measurements to start tracking progress.",
  },

  purchaseHistory: {
    title: "Purchase History",
    emptyTitle: "No subscription history yet",
    emptySubtitle: "Subscribe to a plan to see it show up here.",
  },

  streak: {
    title: "Streak Tracker",
    current: "Current streak",
    byCategory: "Streaks by category",
  },

  ticket: {
    newTitle: "New Ticket",
    subject: "Subject",
    subjectPlaceholder: "A short summary",
    message: "Message",
    messagePlaceholder: "What's going on?",
    submit: "Submit",
    reply: "Reply…",
    send: "Send",
    category: {
      bug: "Bug Report",
      feature_request: "Feature Request",
      billing: "Billing",
      account: "Account",
      other: "Other",
    },
  },

  lock: {
    subtitle: "Unlock with Face ID or Touch ID to continue.",
    unlock: "Unlock",
    logOut: "Log Out",
  },

  barcode: {
    permissionTitle: "Camera access needed",
    allow: "Allow Camera",
    manual: "Log manually instead",
  },

  restTimer: {
    title: "REST TIMER",
    complete: "Rest complete!",
    add15: "+15s",
  },

  wizard: { back: "Back" },
  offline: { banner: "No internet connection" },

  checkoutCode: {
    placeholder: "FX-XXXXXXXX",
    a11y: "Discount or referral code",
  },

  timelineExtra: {
    eventTitle: "Timeline Event",
    byMonth: "By month",
  },

  recipes: { title: "Recipes", empty: "No recipes yet" },

  /** Onboarding — the assessment a new user cannot skip. */
  onboarding: {
    aboutYou: {
      step: "About You",
      title: "Tell us about yourself",
      subtitle: "This helps us personalize your training and nutrition plans.",
      age: "Age",
      weight: "Weight",
      height: "Height",
      baseline: "Baseline measurements",
      bodyFat: "Body fat %",
      waist: "Waist",
      hips: "Hips",
      optionalNote: 'Optional — skip anything you don\'t know precisely. Leave a value at "–" to leave it out.',
    },
    goals: { step: "Goals", title: "What are your goals?", subtitle: "Select as many as apply — you can change these later." },
    level: { step: "Training Level", title: "What's your experience level?" },
    schedule: {
      step: "Schedule",
      title: "When can you train?",
      subtitle: "A rough idea helps us understand your availability — this doesn't lock you into a fixed schedule.",
      daysPerWeek: "Days per week",
      whichDays: "Which days work best?",
      sessionLength: "Typical session length",
    },
    equipment: {
      step: "Equipment",
      title: "What do you have access to?",
      subtitle: "This helps us steer clear of programs that need equipment you don't have.",
    },
    diet: { step: "Food/Diet", title: "Your diet preferences", dietType: "Diet type" },
    safety: {
      step: "Safety",
      title: "Any medical conditions or injuries?",
      subtitle: "This helps us avoid recommending unsafe exercises.",
      medicalConditions: "Medical conditions",
    },
    generating: {
      building: "Building your plan",
      ready: "Your plan is ready",
      failed: "Couldn't build your plan",
      getStarted: "Get Started",
      retry: "Retry",
      skip: "Skip for now — I'll set this up later",
      picking: "Picking the right program for your goals and safety context…",
      answersSaved: "Your assessment answers are saved — nothing is lost. Try again below.",
    },
    summary: {
      step: "Review",
      title: "Review your assessment",
      subtitle: "Check your answers before we build your plan.",
      goals: "Goals",
      experience: "Experience level",
      schedule: "Schedule",
      equipment: "Equipment",
      diet: "Diet",
      allergens: "Allergens",
      baseline: "Baseline measurements",
      safety: "Safety",
      medicalConditions: "Medical conditions",
      injuries: "Injuries",
      noneReported: "None reported.",
      noneSelected: "None selected",
      notSet: "Not set",
    },
  },

  timeline: {
    title: "Timeline",
    prs: "PRs",
    milestones: "Milestones",
    programs: "Programs",
    empty: "No milestones yet",
    viewMonth: "View Month",
    viewReport: "View Report",
  },

  aiCoach: {
    // FynroX AI is a product name and stays as-is in every language, for
    // the same reason the plan tiers do.
    unavailable: "AI Coach isn't available yet",
    greeting: "Hey — I'm FynroX AI.",
    placeholder: "Ask your coach anything…",
    messageA11y: "Message to AI Coach",
    sendA11y: "Send message",
  },

  recoverHub: {
    title: "Recover",
    subtitle: "Rest, recovery & AI guidance",
    chat: "Chat with FynroX AI",
    log: "Recovery Log",
    logSubtitle: "Resting HR, sleep, HRV, soreness & energy",
    open: "Open Recovery",
  },

  country: {
    title: "Country",
    search: "Search countries",
    manualCode: "2-letter code",
    setCode: "Set country code",
    dontSee: "Don't see your country?",
    dontSeeNote:
      "This list covers common markets only — enter your country's 2-letter code directly (e.g. US, IN, DE).",
  },

  /** Progress — measurements, trends, records, and the plan review. */
  progress: {
    title: "Progress",
    checkIn: "Check-In",
    viewCheckIn: "View Check-In",
    doCheckIn: "Check In",
    weightTrend: "Weight trend",
    noWeighIns: "No weigh-ins yet — log one to start a trend.",
    personalRecords: "Personal records",
    noRecords: "Complete a workout with weighted sets to see PRs here.",
    measurements: {
      chest: "Chest",
      waist: "Waist",
      hips: "Hips",
      arms: "Arms",
      thighs: "Thighs",
    },
    links: {
      review: { label: "Progress Review", subtitle: "Recent activity and what your plan suggests" },
      logMeasurement: "Log Measurement",
      measurementHistory: "Measurement History",
      streakTracker: "Streak Tracker",
      photos: "Progress Photos",
    },
    whyChanged: {
      title: "Why This Changed",
      emptyTitle: "No recommendation yet",
      emptySubtitle: "Check your recent activity against your plan to see if anything should change.",
      chooseDifferent: "Choose a different program",
      noOthers: "No other real programs available right now.",
      confirmSwitch: "Confirm Switch",
      chooseAnother: "Choose a Different Program",
      decline: "Decline",
    },
    review: {
      title: "Progress Review",
      subtitle: "Your recent activity, and what your plan suggests",
      error: "Couldn't load your recommendation.",
      whyThisChanged: "Why This Changed",
      check: "Check for a Recommendation",
      recentTraining: "Recent training",
      noWorkouts: "No completed workouts yet — finish one to see it here.",
      oneWeighIn: "Only one weigh-in logged, no trend yet",
      noWeighIns: "No weigh-ins logged yet.",
      yourRecommendation: "Your recommendation",
      continueCurrent: "Continue Current Plan",
      switchTo: "Switch to {{program}}",
      aNewProgram: "a new program",
    },
  },

  /** Train tab — the programme catalogue and its entry points. */
  train: {
    title: "Train",
    noPrograms: "No programs yet",
    links: {
      browse: { label: "Browse All Programs", subtitle: "Search & filter the full catalog" },
      mine: { label: "My Programs", subtitle: "Purchased & started plans" },
      exercises: { label: "Exercise Library", subtitle: "Browse by muscle & equipment" },
      history: { label: "Workout History", subtitle: "Past sessions & PRs" },
    },
  },

  /** Train — workouts, programmes, exercises and the set tracker. */
  workout: {
    title: "Workout",
    exercise: "Exercise",
    program: "Program",
    // No `startWorkout` here: both buttons that say it (Today and Workout
    // detail) share `today.startWorkout`. One string, one translation.
    logSet: "Log Set",
    reps: "Reps",
    weightOptional: "Weight (kg, optional)",
    weightKg: "WEIGHT (KG)",
    upNext: "Up Next",
    resumed: "Resumed from where you left off — nothing was lost.",
    rpeOptional: "RPE (perceived exertion, optional)",
    rpeCaps: "RPE (PERCEIVED EXERTION)",
    abandon: "Abandon Workout",
    openTracker: "Open Set & Rest Tracker",
    setRestTracker: "SET / REST TRACKER",
    warmUp: "Warm-Up",
    dropSet: "Drop Set",
    setHistory: "Set History",
    noSets: "No sets logged for this exercise yet.",
    noPhoto: "No demonstration photo for this exercise yet.",
    complete: {
      title: "Workout Complete!",
      niceWork: "Nice work — logged and saved.",
      sets: "Sets",
      volume: "Volume",
      duration: "Duration",
      streak: "Training streak",
      newRecords: "New Personal Records",
      backToTrain: "Back to Train",
    },
    history: {
      title: "Workout History",
      search: "Search workouts",
      sessions: "Sessions",
      completed: "Completed",
      sets: "Sets",
      volume: "Volume",
      emptyTitle: "No workouts match",
      emptySubtitle: "Try a different search, filter, or day.",
    },
    library: {
      title: "Exercise Library",
      search: "Search exercises",
      muscleGroup: "MUSCLE GROUP",
      emptyTitle: "No exercises match",
      emptySubtitle: "Try a different search or filter.",
    },
    marketplace: {
      title: "Browse Programs",
      search: "Search programs",
      emptyTitle: "No programs match",
      emptySubtitle: "Try a different search or filter.",
    },
    mine: {
      title: "My Programs",
      emptyTitle: "No programs yet",
      emptySubtitle: "You haven't started or purchased any programs yet — browse Programs on the Train tab.",
      browse: "Browse Programs",
    },
    programDetail: {
      free: "Free",
      purchased: "Purchased",
      purchase: "Purchase this program",
      couponPlaceholder: "Have a coupon? Enter code",
      noWorkouts: "No workouts in this program yet.",
    },
    programProgress: {
      title: "Program Progress",
      viewCompletion: "View Completion",
      viewWorkouts: "View Workouts",
    },
    programComplete: {
      title: "Program Complete",
      viewProgress: "View Progress",
      backToMine: "Back to My Programs",
      browseMore: "Browse More Programs",
    },
  },

  /** Recover tab — daily check-in metrics and mindfulness sessions. */
  recover: {
    title: "Recovery",
    logToday: "Log today",
    selfReported: "Self-reported — enter what you have. Saving again updates today's entry.",
    notesOptional: "Notes (optional)",
    noteOptional: "Note (optional)",
    metrics: {
      restingHr: "Resting HR",
      sleep: "Sleep",
      hrv: "HRV",
      soreness: "Soreness",
      energy: "Energy",
    },
    mindfulness: {
      title: "Log Mindfulness Session",
      duration: "Duration",
      typeOptional: "Type (optional)",
      typePlaceholder: "e.g. breathing",
      logSession: "Log session",
      loggedToday: "{{minutes}} min logged today — logging again adds another session.",
      prompt: "A quick self-report — how long, and what kind (optional).",
    },
    averages: "{{days}}-day averages",
    recent: "Recent",
  },

  /** Fuel tab — nutrition dashboard, meal logging and the calendar. */
  fuel: {
    title: "Fuel",
    todaysNutrition: "Today's nutrition",
    macros: { protein: "Protein", carbs: "Carbs", fat: "Fat" },
    waterError: "Couldn't load today's water intake.",
    calories: "Calories",
    meals: "Meals",
    tapToAdd: "Tap to add",
    hydration: "Hydration",
    mealTypes: {
      breakfast: "Breakfast",
      lunch: "Lunch",
      dinner: "Dinner",
      snack: "Snack",
    },
    addGlass: "+1 Glass",
    links: {
      recipes: { label: "Recipes", subtitle: "Browse & log meals" },
      calendar: { label: "Nutrition Calendar", subtitle: "Compliance & history" },
      mealPlan: { label: "Meal Plan", subtitle: "AI-generated, from real recipes" },
    },
    logMeal: {
      title: "Log Meal",
      describe: "Describe what you ate",
      describePlaceholder: "e.g. 2 eggs and a slice of toast",
      aiNote: "AI estimates the calories and macros — you'll review and can edit before it's logged.",
      estimate: "Estimate",
      scanBarcode: "Scan Barcode",
      manualEntry: "Manual entry",
      meal: "Meal",
      whatDidYouEat: "What did you eat?",
      calories: "Calories",
      proteinG: "Protein (g)",
      carbsG: "Carbs (g)",
      fatG: "Fat (g)",
    },
    confirmEstimate: {
      title: "Confirm Estimate",
      banner: "AI estimate — review before logging",
      caveat: "These numbers are a guess, not a fact yet. Edit anything that looks off, then log it.",
      logIt: "Log it",
    },
    recipe: { title: "Recipe", logThisMeal: "Log this meal", calories: "Calories" },
    mealPlan: {
      title: "Meal Plan",
      nDayPlan: "{{days}}-day plan",
      emptyTitle: "No meal plan yet",
      emptySubtitle:
        "Generate a real, AI-curated meal plan built from your diet type, allergens, and goals — using real recipes from the catalog.",
      generate: "Generate Meal Plan",
      regenerate: "Regenerate",
      picking: "Picking real recipes that fit your diet and goals…",
    },
    calendar: {
      title: "Nutrition Calendar",
      emptyTitle: "No meals logged yet",
      emptySubtitle: "Log a meal from the Nutrition Dashboard to see it here.",
      onTrack: "On Track",
      under: "Under",
      over: "Over",
      daysLogged: "Days Logged",
      mealsLogged: "Meals Logged",
      avgKcal: "Avg kcal/day",
      thisMonth: "This Month",
      noMealsThisDay: "No meals logged this day.",
      compliance: "Compliance",
      day: {
        onTrack: "On track",
        over: "Over target",
        under: "Under target",
        none: "No log",
      },
    },
  },

  checkout: {
    title: "Checkout",
    haveACode: "Have a code?",
    apply: "Apply",
    codeApplied: "{{code}} applied",
    payWith: "Pay with",
    pay: "Pay {{amount}}",
    total: "Total",
    discount: "Discount",
    inclGst: "Incl. {{percent}}% GST ({{amount}})",
    includesTrial: "Includes a free trial period",
    paymentsUnavailable: "Payments aren't available on this server yet.",
    processing: {
      title: "Processing your payment",
      subtitle: "Don't close this screen — we're confirming with your bank.",
    },
  },

  purchases: {
    title: "Purchases",
    subtitle: "Receipts and refund status",
    empty: {
      title: "No purchases yet",
      subtitle: "Anything you buy will show up here with its receipt.",
    },
    refund: {
      pending: {
        label: "Refund pending",
        detail: "Your refund has been approved and is being sent to your bank.",
      },
      processed: {
        label: "Refunded",
        detail: "Your refund has been sent. Banks usually take 5–7 working days to show it.",
      },
      failed: {
        label: "Refund failed",
        detail:
          "The refund couldn't be completed. Our team has been notified — contact support if it doesn't resolve.",
      },
      partial: "Partial refund of {{amount}}",
    },
    activationFailed: {
      label: "Access not activated",
      detail:
        "Your payment went through but access didn't activate. Open the payment to retry — you won't be charged again.",
    },
  },

  guidance: {
    title: "Professional guidance",
    subtitle: "Ask for a verified fitness or nutrition professional",
    yourRequest: "Your request",
    whatHelp: "What do you need help with?",
    noteLabel: "Anything the professional should know (optional)",
    notePlaceholder: "Goals, injuries, schedule…",
    send: "Send request",
    onlyPayOnAccept: "We match you with a professional from our verified network. You only pay once they accept.",
    cancel: "Cancel request",
    earlier: "Earlier requests",
    sendFailed: "Couldn't send your request",
    cancelFailed: "Couldn't cancel",
    status: {
      open: {
        label: "Finding a professional",
        detail: "We're matching you with a verified professional. This usually takes a day or two.",
      },
      offered: {
        label: "Waiting on a professional",
        detail: "We've sent your request to a professional and are waiting for them to accept.",
      },
      fulfilled: {
        label: "Matched",
        detail: "A professional accepted. You'll find them under your professional team.",
      },
      cancelled: {
        label: "Cancelled",
        detail: "You cancelled this request. You can raise a new one any time.",
      },
      exhausted: {
        label: "No match yet",
        detail:
          "We couldn't find an available professional for this request. Our team has been notified and will get in touch.",
      },
    },
    // Pluralised through CLDR rules, not a hand-written "s" — this is
    // the kind of string a homegrown layer silently gets wrong in Hindi.
    rematch_one: "{{count}} professional couldn't take this on — we're still looking.",
    rematch_other: "{{count}} professionals couldn't take this on — we're still looking.",
  },

  payment: {
    successTitle: "Payment Successful",
    failedTitle: "Payment Failed",
    activatingTitle: "Finishing Activation",
    allSet: "You're all set",
    received: "Payment received",
    wentWrong: "Something went wrong",
    activeNow: "Your subscription is now active. Enjoy FynroX.",
    didNotGoThrough: "Your payment didn't go through.",
    notCharged: "You haven't been charged.",
    activationPending:
      "Your payment went through, but we couldn't finish activating it yet. You have not been charged again.",
    retryActivation: "Retry Activation",
    checkBackLater: "I'll check back later",
    backToPlans: "Back to Plans",
  },
} as const;

export type TranslationCatalogue = typeof en;
