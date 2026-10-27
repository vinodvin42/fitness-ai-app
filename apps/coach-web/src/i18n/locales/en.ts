/**
 * English source catalogue for the professional app — the single place
 * user-facing copy lives.
 *
 * Keys are `screen.element`, matching the screen's own file name, so the
 * string for a piece of UI is findable from the component and vice
 * versa. Nested rather than flat because a flat file of several hundred
 * dotted keys is unreadable by the translators who work in it.
 *
 * Deliberately NOT here: product names (Fynrox, Fynrox Coach), which
 * stay identical in every language, and anything the API sends back — a
 * decline reason, a client's name, a service label. Those are the API's
 * to translate, not this client's.
 *
 * Only `en` exists. The other nine languages resolve through
 * `fallbackLng` until translations are written, so an untranslated
 * screen shows English rather than a raw key.
 */
import { settings } from "./web/settings";
import { business } from "./web/business";
import { clients } from "./web/clients";
import { clientProfile } from "./web/clientProfile";
import { comms } from "./web/comms";

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
    notSet: "Not set",
  },

  auth: {
    layout: {
      eyebrow: "For trainers and nutritionists",
      headline: "Coach with",
      headlineAccent: "better tools.",
      benefitMatched: "Client requests matched to you, no bidding",
      benefitSummary: "A recent summary of each client's logs, with their consent",
      benefitDecide: "Accept or decline each match within 48 hours",
      reviewNote: "We review every application before an account goes live.",
      help: "Questions? Email support@fynrox.com",
    },
    showPassword: "Show password",
    hidePassword: "Hide password",
    login: {
      title: "Welcome back, Coach",
      subtitle: "Log in to manage your clients.",
      email: "Email",
      password: "Password",
      submit: "Log In",
      newHere: "New to Fynrox Coach?",
      createAccount: "Create an account",
    },
    signup: {
      title: "Create your coaching account",
      subtitle: "Join as a Professional and connect with clients on Fynrox.",
      fullName: "Full name",
      email: "Email",
      phone: "Phone (optional)",
      password: "Password (min. 8 characters)",
      confirmPassword: "Confirm password",
      submit: "Create Account",
      haveAccount: "Already have an account?",
      logIn: "Log in",
    },
  },

  onboarding: {
    serviceSelection: {
      step: "Service Selection",
      title: "What do you offer?",
      subtitle: "Select at least one — you can update this later.",
      genderTitle: "Your gender (optional)",
      genderHelp: "Members can ask for a male or female coach. You can change this later in More > My profile.",
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
      howItWorks:
        "You can take clients for a service once your identity and that service's credential are both Verified. Anything still Pending unlocks automatically after Fynrox reviews it.",
      rejected: "Fynrox couldn't accept this document.",
      rejectedReason: "Reason: {{reason}}",
      expires: "Expires {{date}}",
      uploadAgain: "Upload documents again",
      uploadHint: "Upload anything that isn't Verified yet. It goes back to Pending until Fynrox reviews it.",
    },
  },

  today: {
    earningsError: "Couldn't load your earnings. Check your connection and try again.",
    noServices: "No services selected yet.",
    noSessions: "No sessions scheduled today.",
    quickActions: "Quick Actions",
    actionRequests: "Client requests",
    actionCalendar: "Calendar",
    actionMessages: "Messages",
    avgRating: "Avg. Rating",
    ratingCount_one: "From {{count}} session rating",
    ratingCount_other: "From {{count}} session ratings",
    noRatings: "No ratings yet. Clients can rate a session after it ends.",
    ratingError: "Couldn't load your ratings. Pull down to try again.",
    activeClients: "Active Clients",
    sessionsThisWeek: "Sessions This Week",
    schedule: "Today's Schedule",
    settlementHistory: "Settlement History",
    noSettlements: "No settlements yet — your first one is created once a full month of bookings closes out.",
    earnings: "Earnings",
    noEarningsYet: "No earnings yet — this fills in once your first confirmed, paid booking lands.",
    thisMonthNet: "This month (net)",
    grossLine: "Gross {{gross}} · {{pct}}% platform fee",
    // CLDR plural. The original branched on `length === 1` in English,
    // which is correct here and silently wrong in most of the ten
    // languages this catalogue is built for.
    stuck_one:
      "This client relationship didn't finish activating and won't show up under Clients yet. This has been flagged to Fynrox support — no action is required from you, but reach out to support if you expected this to be resolved by now.",
    stuck_other:
      "These {{count}} client relationships didn't finish activating and won't show up under Clients yet. This has been flagged to Fynrox support — no action is required from you, but reach out to support if you expected this to be resolved by now.",
    // Stated plainly rather than rendered as disabled buttons: a control
    // that does nothing is a worse lie than a sentence saying so.
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
    formReviews: { label: "Form reviews", subtitle: "Review exercise clips submitted by your clients" },
    profile: { label: "My profile", subtitle: "Your gender, used to match members who ask for a male or female coach" },
    verification: { label: "Verification & documents", subtitle: "Your credential and ID status, and uploading them again" },
    help: {
      label: "Help & support",
      subtitle: "Email support@fynrox.com",
      title: "Help & support",
      message: "Email support@fynrox.com with your question. We usually reply within one working day.",
    },
    signOut: {
      label: "Sign out",
      subtitle: "Sign out of Fynrox Coach on this device",
      confirmTitle: "Sign out?",
      confirmMessage: "You'll need your email and password to sign in again.",
      confirm: "Sign out",
    },
    needsReview_one: "{{count}} to review",
    needsReview_other: "{{count}} to review",
    account: "Account",
  },

  notifications: {
    emptyTitle: "Nothing needs your attention",
    emptySubtitle: "New requests, bookings, offers from Fynrox and unread messages show up here.",
    pendingRequests: "Pending client requests",
    reviewRequests: "Accept or decline ›",
    stuckActivating: "Needs attention — stuck activating",
    alreadyFlagged: "Already flagged to Fynrox support — no action required from you.",
    unreadTitle: "Unread messages",
    unreadCount_one: "{{count}} unread message",
    unreadCount_other: "{{count}} unread messages",
    openMessages: "Open Messages ›",
    offersTitle: "Offers from Fynrox",
    offeredAgo: "Offered {{ago}}",
    reviewOffers: "Accept or decline ›",
    newBookings: "New bookings",
    bookedAgo: "Booked {{ago}}",
    moreBookings: "{{count}} more in Calendar.",
    openCalendar: "Open Calendar ›",
  },

  earnings: {
    title: "Earnings",
    payoutFailed: "A payout didn't reach you",
    paidToYou: "Paid to you",
    awaitingPayout: "Awaiting payout",
    thisMonth: "This month",
    emptyTitle: "No settlements yet",
    emptySubtitle: "Once a period is settled it'll appear here with its payout status.",
    bankDetailsNote: "If your bank details have changed, send the new ones to Fynrox support so the retry succeeds.",
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
      requests: "Client Requests",
      requestsNote: "Users who requested you directly.",
      emptyTitle: "No pending requests",
      emptySubtitle:
        "When a user requests you as their coach, their request will show up here for you to accept or decline.",
      offers: "Offers from Fynrox",
      offersEmptyTitle: "No offers right now",
      offersEmptySubtitle:
        "When Fynrox proposes you as a coach for a specific client, it'll show up here for you to accept or decline.",
      offerNote: "Fynrox proposed you as this client's coach — accepting creates the relationship.",
      notResponded: "You haven't responded to this yet — Fynrox support can see this too.",
      // What the member asked for when they requested (25 Oct 2026).
      askedFor: "Asked for",
      preferredDay: "Preferred day",
      anyDay: "Any day",
      note: "Their note",
      replyBy: "Reply by {{when}}",
      expiredTitle: "This request expired",
      expiredBody: "{{name}}'s request wasn't answered in time, so it's no longer on your list.",
      dismiss: "Dismiss",
    },
    offers: {
      title: "Offers",
      reasonPlaceholder: "At capacity, outside my speciality, schedule clash…",
      confirmDecline: "Confirm decline",
      intro: "Clients Fynrox has proposed you for.",
      returned: "This went back to Fynrox to be offered to someone else.",
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

  /** Session summary (25 Oct 2026): the coach's write-up of a session, which the client reads in their app. */
  sessionSummary: {
    write: "Write summary",
    published: "Summary published",
    title: "Session summary",
    intro: "{{name}} can read this summary in their app once you publish it.",
    replaceNote: "Publishing replaces the summary {{name}} can read now.",
    placeholder: "What you covered, how it went and what to do before the next session",
    inputLabel: "Session summary",
    publish: "Publish summary",
    publishedAt: "Published {{when}}",
    edit: "Edit summary",
    done: "Done",
    failed: "Couldn't publish the summary",
    loading: "Loading the summary",
    loadFailed: "Couldn't load the summary",
  },

  messages: {
    title: "Messages",
    viewProfile: "View profile ›",
    emptyTitle: "No conversations yet",
    emptySubtitle: "When you have an active client, you can message each other here.",
    placeholder: "Message…",
  },

  /** My profile (20 Oct 2026): the coach's gender, for members who ask for a male or female coach. */
  profile: {
    title: "My profile",
    genderTitle: "Your gender",
    genderHelp:
      "Members can ask for a male or female coach. Requests that ask for one only go to coaches of that gender; with \"Prefer not to say\" you only get requests with no preference.",
    female: "Female",
    male: "Male",
    preferNot: "Prefer not to say",
    saved: "Saved",
    saveFailed: "Couldn't save",
    // Profile photo (25 Oct 2026).
    photoTitle: "Profile photo",
    photoHelp: "Members see this on your profile and when they look for a professional. Use a clear photo of your face.",
    choosePhoto: "Choose photo",
    changePhoto: "Change photo",
    takePhoto: "Take photo",
    removePhoto: "Remove photo",
    removePhotoTitle: "Remove your photo?",
    removePhotoBody: "Members will see your initials instead.",
    photoSaved: "Photo saved",
    photoFailed: "Couldn't update your photo",
    // Languages (25 Oct 2026).
    languagesTitle: "Languages you coach in",
    languagesHelp: "Members see these on your profile and can look for a professional who speaks their language. Pick every language you can run a session in.",
  },

  /** The web app's own chrome (26 Oct 2026): navigation, theme and account menu. */
  web: {
    nav: {
      main: "Coaching",
      business: "Business",
      account: "Account",
      today: "Today",
      clients: "Clients",
      requests: "Requests & offers",
      calendar: "Calendar",
      messages: "Messages",
      inbox: "Inbox",
      earnings: "Earnings",
      formReviews: "Form reviews",
      availability: "Availability",
      profile: "My profile",
      verification: "Verification",
      help: "Help & support",
      more: "More",
    },
    theme: {
      label: "Theme",
      light: "Light",
      dark: "Dark",
      system: "System",
    },
    account: {
      menu: "Account menu",
      signOut: "Sign out",
    },
    auth: {
      loginFailed: "Incorrect email or password.",
      signupFailed: "Could not create your account. That email may already be taken.",
      passwordsMismatch: "Passwords don't match.",
      passwordTooShort: "Use at least 8 characters.",
    },
    today: {
      greetingMorning: "Good morning, {{name}}",
      greetingAfternoon: "Good afternoon, {{name}}",
      greetingEvening: "Good evening, {{name}}",
      needsYou: "Needs you",
      requestsWaiting_one: "{{count}} client request or offer waiting",
      requestsWaiting_other: "{{count}} client requests or offers waiting",
      unreadWaiting_one: "{{count}} unread message",
      unreadWaiting_other: "{{count}} unread messages",
      reviewsWaiting_one: "{{count}} form clip to review",
      reviewsWaiting_other: "{{count}} form clips to review",
      lifetimePaid: "Lifetime paid {{amount}}",
      earningsNote: "Gross is the booking value of this month's confirmed sessions, already paid by clients. It becomes a settlement when the month closes.",
      viewEarnings: "View earnings",
      viewCalendar: "Full calendar",
      services: "Your services",
      settlementGross: "Gross {{gross}} · {{pct}}% fee",
    },
    inboxCount_one: "Inbox, {{count}} item needs you",
    inboxCount_other: "Inbox, {{count}} items need you",
    loading: "Loading",
    notFoundTitle: "Page not found",
    notFoundBody: "This page doesn't exist in Fynrox Coach.",
    goToday: "Go to Today",
    clients,
    clientProfile,
    comms,
    business,
    settings,
  },
} as const;

export type TranslationCatalogue = typeof en;
