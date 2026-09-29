/**
 * English source catalogue for the professional app — the single place
 * user-facing copy lives.
 *
 * Keys are `screen.element`, matching the screen's own file name, so the
 * string for a piece of UI is findable from the component and vice
 * versa. Nested rather than flat because a flat file of several hundred
 * dotted keys is unreadable by the translators who work in it.
 *
 * Deliberately NOT here: product names (FynroX, FynroX Coach), which
 * stay identical in every language, and anything the API sends back — a
 * decline reason, a client's name, a service label. Those are the API's
 * to translate, not this client's.
 *
 * Only `en` exists. The other nine languages resolve through
 * `fallbackLng` until translations are written, so an untranslated
 * screen shows English rather than a raw key.
 */
export const en = {
  common: {
    retry: "Try again",
    cancel: "Cancel",
    save: "Save",
    back: "Back",
    send: "Send",
    accept: "Accept",
    decline: "Decline",
    somethingWentWrong: "Something went wrong",
    checkConnection: "Check your connection and try again.",
    comingSoon: "Coming soon",
    notSet: "Not set",
  },

  auth: {
    splash: {
      tagline: "Join as a Professional — connect with clients and grow your practice.",
      createAccount: "Create Account",
      signIn: "Sign In",
    },
    login: {
      title: "Welcome back, Coach",
      subtitle: "Log in to manage your clients.",
      email: "Email",
      password: "Password",
      submit: "Log In",
      createAccount: "Create an account",
    },
    signup: {
      title: "Create your coaching account",
      subtitle: "Join as a Professional and connect with clients on FynroX.",
      fullName: "Full name",
      email: "Email",
      phone: "Phone (optional)",
      password: "Password (min. 8 characters)",
      confirmPassword: "Confirm password",
      submit: "Create Account",
      haveAccount: "Already have an account? Log in",
    },
  },

  onboarding: {
    serviceSelection: {
      step: "Service Selection",
      title: "What do you offer?",
      subtitle: "Select at least one — you can update this later.",
    },
    credentials: {
      subtitle: "Add your certification details. You can update these later from Verification Status.",
      name: "Certification Name",
      body: "Certifying Body",
      year: "Year Obtained",
      document: "Certification Document",
      certificate: "Qualification Certificate",
    },
    kyc: {
      step: "Identity Verification (KYC)",
      title: "Verify your identity",
      subtitle: "Upload a government ID (e.g. Aadhaar Card) — required once, shared across every service you offer.",
    },
    verification: {
      title: "Verification Status",
      identity: "Identity Verification",
      goToDashboard: "Go to Dashboard",
    },
  },

  today: {
    title: "Today",
    earningsError: "Couldn't load your earnings. Check your connection and try again.",
    noServices: "No services selected yet.",
    noSessions: "No sessions scheduled today.",
    quickActions: "Quick Actions",
    activeClients: "Active Clients",
    sessionsThisWeek: "Sessions This Week",
    schedule: "Today's Schedule",
    settlementHistory: "Settlement History",
    noSettlements: "No settlements yet — your first one is created once a full month of bookings closes out.",
    notAvailableYet: "Not available yet",
    // Named plainly rather than shown as an empty stat: a metric with no
    // entity behind it is not a metric.
    noRatingEntity: "Avg. Rating has no backing entity anywhere in this build — no Review model exists yet.",
    logOut: "Log Out",
    earnings: "Earnings",
    noEarningsYet: "No earnings yet — this fills in once your first confirmed, paid booking lands.",
    thisMonthNet: "This month (net)",
    grossLine: "Gross {{gross}} · {{pct}}% platform fee",
    // CLDR plural. The original branched on `length === 1` in English,
    // which is correct here and silently wrong in most of the ten
    // languages this catalogue is built for.
    stuck_one:
      "This client relationship didn't finish activating and won't show up under Clients yet. This has been flagged to FynroX support — no action is required from you, but reach out to support if you expected this to be resolved by now.",
    stuck_other:
      "These {{count}} client relationships didn't finish activating and won't show up under Clients yet. This has been flagged to FynroX support — no action is required from you, but reach out to support if you expected this to be resolved by now.",
    // Stated plainly rather than rendered as disabled buttons: a control
    // that does nothing is a worse lie than a sentence saying so.
    notBuiltWorkoutPlan: "Create Workout Plan — not built yet",
    notBuiltNutritionPlan: "Create Nutrition Plan — not built yet",
    notBuiltSchedule: "Schedule Client Session — not built yet",
  },

  availabilityStatus: {
    lifecycle: "Lifecycle Status",
    activeClients: "Active Clients",
    maxActiveClients: "Maximum Active Clients",
    suspendedOverride:
      "Your account is suspended, which overrides the lifecycle stage above — you can't accept new clients right now.",
    // §10's professional lifecycle, explained to the professional whose
    // account it is. Keyed by the same status values the API returns.
    stage: {
      application: "You haven't submitted a service credential yet — do that from onboarding to start verification.",
      verification:
        "An admin is reviewing your identity check and service credential(s). You'll move to Approved once both clear.",
      approvedWithCredentials:
        "You're approved, but not yet open for new clients — this needs at least one verified service credential (currently {{verified}} of {{total}} verified). You'll open automatically as soon as one clears.",
      approved:
        "You're approved, but not yet open for new clients — this needs at least one verified service credential. You'll open automatically as soon as one clears.",
      available: "You're open for new clients — clients can be matched to you up to your capacity below.",
      suspended: "Your account is suspended. Contact support to resolve this before you can accept new clients.",
    },
  },

  more: {
    title: "More",
    availability: { label: "Availability & Capacity", subtitle: "Your lifecycle status and how many clients you can take on" },
    earnings: { label: "Earnings", subtitle: "What you've been paid, what's owed, and payout status" },
    offers: { label: "Offers", subtitle: "Clients proposed to you, including ones you declined" },
  },

  notifications: {
    title: "Notifications",
    emptyTitle: "Nothing needs your attention",
    emptySubtitle: "Pending requests and account issues will show up here.",
    pendingRequests: "Pending client requests",
    stuckActivating: "Needs attention — stuck activating",
    openClientsTab: 'Open the Clients tab\'s "Pending Requests" to accept or decline.',
    alreadyFlagged: "Already flagged to FynroX support — no action required from you.",
  },

  earnings: {
    title: "Earnings",
    payoutFailed: "A payout didn't reach you",
    paidToYou: "Paid to you",
    awaitingPayout: "Awaiting payout",
    thisMonth: "This month",
    emptyTitle: "No settlements yet",
    emptySubtitle: "Once a period is settled it'll appear here with its payout status.",
    bankDetailsNote: "If your bank details have changed, send the new ones to FynroX support so the retry succeeds.",
  },

  availability: {
    title: "Availability & Capacity",
  },

  clients: {
    title: "Clients",
    emptyTitle: "No clients yet",
    emptySubtitle: "When a user books you and a coaching relationship starts, they'll appear here.",
    reviewAndRespond: "Review and accept or decline",
    pending: {
      title: "Pending Requests",
      requests: "Client Requests",
      requestsNote: "Users who requested you directly.",
      emptyTitle: "No pending requests",
      emptySubtitle:
        "When a user requests you as their coach, their request will show up here for you to accept or decline.",
      offers: "Offers from FynroX",
      offersEmptyTitle: "No offers right now",
      offersEmptySubtitle:
        "When FynroX proposes you as a coach for a specific client, it'll show up here for you to accept or decline.",
      offerNote: "FynroX proposed you as this client's coach — accepting creates the relationship.",
      notResponded: "You haven't responded to this yet — FynroX support can see this too.",
    },
    offers: {
      title: "Offers",
      reasonPlaceholder: "At capacity, outside my speciality, schedule clash…",
      confirmDecline: "Confirm decline",
      intro: "Clients FynroX has proposed you for.",
      returned: "This went back to FynroX to be offered to someone else.",
      whyDeclining: "Why are you declining? (optional — it helps us match better next time)",
    },
    recommendations: {
      review: "Review Recommendations",
      emptyTitle: "Nothing pending",
      emptySubtitle:
        "When this client's AI Plan Recommendation engine has a real recommendation awaiting a decision, it will show up here.",
      awaiting: "Awaiting your review",
      reject: "Reject",
    },
    profile: {
      activityError: "Couldn't load this client's activity.",
      completeProgramme: "Complete Programme",
      endRelationship: "End Relationship",
      handover: "Handover to Another Coach",
      reasonRequired: "Reason (required)",
      searchProfessionals: "Search available professionals…",
      raiseSafety: "Raise a safety concern",
      safetyPlaceholder: "What happened, when, and what concerns you about it",
      raiseFlag: "Raise flag",
      privateNotes: "Private notes",
      notesError: "Couldn't load notes.",
      noNotes: "No notes yet.",
      notePlaceholder: "Add a private note about this client…",
      saveNote: "Save note",
      activity: "Client activity",
      noWorkouts: "No workout sessions in the last 30 days.",
      noMeals: "No meal logs in the last 30 days.",
      noCheckIns: "No check-ins in the last 30 days.",
      measurements: "Body measurements",
      noMeasurements: "No measurements logged in the last 30 days.",
      coachingProfile: "Coaching profile",
      goals: "Goals",
      trainingLevel: "Training level",
      diet: "Diet",
      noneScheduled: "None scheduled.",
      notesPrivate: "Only you can see these — the client never does.",
      safetyPrompt: "What have you noticed? Be specific — this goes to our safety team, not to the client.",
      proposeReplacement: "Propose a replacement (optional) — leave unselected to just end the relationship.",
      noProfessionalsAvailable: "No professionals are currently available for new clients.",
      recentLimit: "Showing the most recent 50 sessions.",
      notAvailable: "Not available",
      // Two different withholdings, stated separately because they have
      // different reasons — one is a policy, the other is a missing
      // consent workflow.
      mediaWithheld: "Progress photos and AI coach conversation content aren't shown to coaches.",
      healthWithheld:
        "Sensitive health data (age, weight, height, medical conditions, injuries) isn't shown to coaches — it's gated behind a consent workflow this build doesn't have yet.",
    },
  },

  calendar: {
    title: "Calendar",
    emptyUpcomingTitle: "No upcoming sessions",
    emptyUpcomingSubtitle: "Confirmed bookings will show up here.",
    emptyPast: "No past sessions yet",
    recentLimit: "Showing the most recent 50 past sessions.",
  },

  messages: {
    title: "Messages",
    emptyTitle: "No conversations yet",
    emptySubtitle: "When you have an active client, you can message each other here.",
    placeholder: "Message…",
  },
} as const;

export type TranslationCatalogue = typeof en;
