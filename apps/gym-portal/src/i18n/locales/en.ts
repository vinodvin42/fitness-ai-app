/**
 * English source catalogue for the gym partner portal.
 *
 * Keys are `screen.element`, matching the screen's own file name.
 *
 * Deliberately NOT here: product names (Fynrox), and anything the API
 * sends back — a gym's own name, a location label, a status string the
 * server already worded. Those are the API's to translate.
 *
 * Only `en` exists; the other nine resolve through `fallbackLng` until
 * translations are written, so an untranslated screen shows English
 * rather than a raw key.
 */
export const en = {
  shell: {
    portalName: "Gym Partner Portal",
    // Repeated in the sidebar footer on every screen, because the
    // boundary is the single thing a partner most often misremembers.
    aggregateOnly: "Aggregate data only — never a member list (see Support for details).",
    signOut: "Sign out",
  },

  nav: {
    dashboard: "Dashboard",
    invite: "Invite members",
    equipment: "Equipment",
    help: "Trainer help",
    partnership: "Partnership",
    support: "Support",
  },

  login: {
    email: "Contact email",
    password: "Password",
    submit: "Sign in",
    submitting: "Signing in…",
    noAccess: "No portal access yet, or forgot your password? Contact Fynrox support — your account manager can set or reset it.",
  },

  dashboard: {
    underReview:
      "Your partner application is still under review — your invite code and dashboard are ready, but they'll go live for real signups once Fynrox approves you.",
    suspended: "Your partner account is currently suspended. Contact Fynrox support (see the Support tab) to resolve this.",
    memberInvite: "Member Invite",
    shareCode: "Share this code or QR with your members so Fynrox signups can be attributed to your gym.",
    inviteCode: "Invite code",
    memberActivity: "Member Activity",
    membersJoined: "Members joined via your invite",
    onboardingCompleted: "Onboarding completed",
    firstWorkout: "First workout completed",
    aggregateNote:
      "Aggregate counts only — Fynrox never shares a member list, individual activity, nutrition logs, medical/safety data, or private conversations with you.",
    noLocations: "No locations on file yet — contact Fynrox support to add one.",
    commercialStatus: "Commercial Status",
  },

  equipment: {
    why: "Members' training plans are built around the equipment you list here. Keeping it current is the single biggest thing you can do to make their programmes fit your floor.",
    noLocations: "No locations on file yet — contact Fynrox support and we'll add them.",
    atLocation: "Equipment at this location",
    placeholder: "Squat racks, dumbbells to 50kg, leg press, 2 treadmills…",
    save: "Save list",
    stillAccurate: "Still accurate",
  },

  help: {
    yourRequests: "Your requests",
    empty: "Nothing open. Use the form to ask our team about programming, equipment or getting members started.",
    replied: "Fynrox replied",
    ask: "Ask for help",
    about: "What's it about?",
    location: "Location (optional)",
    allLocations: "All locations",
    need: "What do you need?",
    reference: "Your own reference (optional)",
    referencePlaceholder: "e.g. the 6am group",
    referenceNote: "For your records only. We can't discuss an individual member's training, food or health data.",
    send: "Send request",
  },

  invite: {
    notActive:
      "Your partnership isn't active yet, so this link won't work for members. We'll let you know as soon as it does — there's no need to reprint anything, the code doesn't change.",
    downloadPng: "Download PNG",
    // Stated rather than shown as a disabled button — see
    // apps/api/src/providers for the same discipline about placeholders.
    noPdf: "A designed PDF poster isn't available yet — the PNG prints well at A5 or larger.",
    yourLink: "Your invite link",
    copyLink: "Copy link",
    inviteCode: "Invite code",
    typeInstead: "Members can type this in the app if they'd rather not scan.",
    attributionNote:
      "Signups through this code are attributed to your gym. You'll see the counts on your dashboard — never a member list, and never anything about their training.",
  },

  partnership: {
    membersJoined: "Members joined",
    noneYet: "No one yet — share your invite link to get started.",
    aggregateOnly: "Aggregate count only, never a member list.",
    commercialTerms: "Commercial terms",
  },

  support: {
    title: "Contact Fynrox Partner Support",
    body: "For anything about your partner account — commercial terms, adding or updating a location, resetting your portal password, or a question about your invite code.",
    responseTime: "Response time",
    responseValue: "Typically within 1–2 business days.",
    boundary:
      "Fynrox never shares your members' nutrition logs, medical or safety information, progress photos, or private AI Coach conversations with your gym — such requests can't be fulfilled.",
  },
} as const;

export type TranslationCatalogue = typeof en;
