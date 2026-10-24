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
    // Plain words for beginners (Oct 2026 decision); route names stay Train/Fuel/Recover.
    train: "Workouts",
    fuel: "Food",
    recover: "Recovery",
    more: "More",
  },

  more: {
    title: "More",
    logOut: "Log out",
    rows: {
      settings: { label: "Settings" },
      progress: { label: "Progress" },
      subscription: { label: "Subscription" },
      purchases: { label: "Purchases" },
      reminders: { label: "Reminders" },
      referral: { label: "Refer & Invite" },
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
    twoFactor: {
      title: "Two-factor authentication",
      subtitle: "Enter the 6-digit code from your authenticator app, or one of your recovery codes.",
      code: "Code",
      submit: "Verify",
      backToLogin: "Back to Login",
    },
    signup: {
      title: "Create your account",
      subtitle: "Start your fitness journey with Fynrox.",
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

  /** Subscription — plans, billing cycle, and the entitlement state. */
  subscription: {
    title: "Subscription",
    cancel: "Cancel Subscription",
    monthly: "Monthly",
    quarterly: "3 months",
    annual: "Annual",
    launchOffer: "Launch offer",
    save: "Save {{percent}}%",
    unlock: "Unlock your full potential",
    choosePlan: "Choose a plan to get started.",
    haveCoupon: "Have a coupon?",
    enterCode: "Enter code",
    couponNote: "Applied at checkout for paid plans. If a code isn't valid, checkout says why and shows the full price.",
    purchaseHistory: "Purchase History",
    comparePlans: "Compare plans",
    feature: "Feature",
    // Plan TIER names (Basic / Pro / Elite) are deliberately absent: they
    // are product names, like Fynrox itself, and translating them would
    // make a user's plan unrecognisable against their receipt.
    features: {
      tracking: "Workout & nutrition tracking",
      progress: "Progress timeline",
      reminders: "Reminders",
      aiCoach: "AI Coach chat",
      recovery: "Recovery logs",
      humanCoaching: "Request a coach (billed separately)",
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
    title: "Coach",
    subtitle: "Ask for a coach and see how your request is going",
    team: {
      title: "My coaches",
      emptyTitle: "No coaches yet",
      emptySubtitle: "Ask for a coach and they'll show up here once they accept.",
      findCoach: "Find a coach",
      bookSession: "Book session",
      message: "Message",
      change: "Change",
      viewProfile: "View profile",
      allMessages: "All messages ›",
      recommended: "Recommended coaches",
    },
    discovery: {
      search: "Search coaches",
      mostExperienced: "Most experienced",
      lowestPrice: "Lowest price",
      findTeam: "My coaches",
      loading: "Loading coaches…",
      emptyTitle: "No verified coaches yet",
      emptySubtitle: "Check back soon, or try a different filter.",
    },
    profile: {
      title: "Coach profile",
      yearsExp: "Years of experience",
      clients: "Clients",
      services: "What they offer",
      noServices: "No services with a price yet.",
    },
    booking: {
      selectTitle: "Book a session",
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
      emptyTitle: "No coach yet",
      emptySubtitle: "Ask for a verified fitness or nutrition coach to get started.",
      yourRequest: "Your Request",
      viewTeam: "See my coaches",
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
        activating: "Starting your coaching…",
        active: "Active",
        // States off the main path (Figma Professional 05b/06/12). GET
        // /coaching/relationships/status can return any non-ended status.
        offered: "A coach has been suggested — waiting for their reply",
        declined: "The coach couldn't take this on",
        expired: "This request expired",
        activation_failed: "Coaching didn't start",
        changing: "Changing coach",
        completed: "Completed",
      },
      requestedNote:
        "Nothing's wrong — the coach hasn't reviewed your request yet. You'll be able to continue as soon as they accept.",
      notActiveNote: "Your coaching hasn't started yet — it starts once this reaches Active.",
      offeredNote: "Nothing to do yet. You'll be able to continue once the coach accepts.",
      declinedNote: "You can ask for another coach.",
      expiredNote: "It wasn't completed in time. You can ask again.",
      activationFailedNote:
        "Your payment went through, but the session couldn't be booked. Try again, or pick another time; you won't be charged again. Or contact support and we'll sort it out.",
      changingNote: "Your change of coach is being arranged.",
      completedNote: "This coaching has finished.",
      stuckStatus: "Taking longer than usual",
      stuckNote: "Your coaching hasn't started yet. If it doesn't start soon, contact support and we'll sort it out.",
      paymentId: "Payment ID: {{id}}",
      earlier: "Earlier",
      askAgain: "Ask for a coach",
      contactSupport: "Contact support",
      continueToPayment: "Continue to payment",
      tryAgain: "Try again",
      pickAnotherTime: "Pick another time",
      booked: "You're booked.",
    },
    change: {
      title: "Change coach",
      headsUp: "Heads up",
      current: "Current coach",
      why: "Why do you want a different coach?",
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
      emptySubtitle: "Ask for a coach and we'll match you with one.",
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

  purchaseHistory: {
    title: "Purchase History",
    emptyTitle: "No subscription history yet",
    emptySubtitle: "Subscribe to a plan to see it show up here.",
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
      complaint: "Complaint",
    },
  },

  lock: {
    subtitle: "Unlock with your fingerprint or face to continue.",
    unlock: "Unlock",
    logOut: "Log Out",
  },

  restTimer: {
    title: "REST TIMER",
    complete: "Rest complete!",
  },

  wizard: { back: "Back" },
  offline: { banner: "No internet connection" },

  checkoutCode: {
    placeholder: "FX-XXXXXXXX",
    a11y: "Discount or referral code",
  },

  /** Onboarding — the assessment a new user cannot skip. */
  onboarding: {
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
      step: "Last step · Review",
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
    weightTrend: "Weight trend",
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

  /** Train — workouts, programmes, exercises and the set tracker. */
  workout: {
    program: "Program",
    programDetail: {
      free: "Free",
      purchased: "Purchased",
      purchase: "Purchase this program",
      couponPlaceholder: "Have a coupon? Enter code",
      noWorkouts: "No workouts in this program yet.",
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
      restingHr: "Resting heart rate",
      sleep: "Sleep",
      hrv: "Body rest (HRV, from a watch)",
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
    paymentsUnavailable: "Online payment isn't switched on yet. Please try again later.",
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
    title: "Find a coach",
    subtitle: "Ask for a verified fitness or nutrition coach",
    yourRequest: "Your request",
    whatHelp: "What do you need help with?",
    noteLabel: "Anything your coach should know (optional)",
    notePlaceholder: "Goals, injuries, schedule…",
    send: "Send request",
    onlyPayOnAccept: "We match you with a coach from our verified network. You only pay once they accept.",
    coachGender: {
      label: "Coach",
      any: "No preference",
      female: "Female coach",
      male: "Male coach",
      requestedFemale: "You asked for a female coach.",
      requestedMale: "You asked for a male coach.",
    },
    cancel: "Cancel request",
    earlier: "Earlier requests",
    sendFailed: "Couldn't send your request",
    cancelFailed: "Couldn't cancel",
    status: {
      open: {
        label: "Finding a professional",
        detail: "We're matching you with a verified coach. This usually takes a day or two.",
      },
      offered: {
        label: "Waiting for a coach",
        detail: "We've sent your request to a coach and are waiting for them to accept.",
      },
      fulfilled: {
        label: "Matched",
        detail: "A coach accepted. You'll find them under My coaches.",
      },
      cancelled: {
        label: "Cancelled",
        detail: "You cancelled this request. You can raise a new one any time.",
      },
      exhausted: {
        label: "No match yet",
        detail:
          "We couldn't find a free coach for this request yet. Our team has been told and will get in touch.",
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
    activeNow: "Your subscription is now active. Enjoy Fynrox.",
    didNotGoThrough: "Your payment didn't go through.",
    notCharged: "You haven't been charged.",
    activationPending:
      "Your payment went through, but we couldn't finish activating it yet. You have not been charged again.",
    retryActivation: "Retry Activation",
    checkBackLater: "I'll check back later",
    backToPlans: "Back to Plans",
    unconfirmedTitle: "Checking Your Payment",
    unconfirmedHeading: "We couldn't confirm your payment yet",
    unconfirmedBody:
      "If money left your account, check My plan again in a few minutes. If your plan hasn't changed by then, contact support with payment ID {{id}} and we'll sort it out.",
  },
} as const;

export type TranslationCatalogue = typeof en;
