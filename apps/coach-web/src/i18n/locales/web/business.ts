/**
 * Web-only copy for the business screens. English source; keys are referenced as
 * `web.business.<key>`. Strings the old app already had stay in en.ts under their
 * original keys, so the two apps read the same.
 *
 * Most of these were hardcoded in apps/coach-mobile's JSX (Earnings,
 * Availability & Capacity, Form reviews); the wording is unchanged.
 */
export const business = {
  earnings: {
    commissionNote: "Fynrox takes {{pct}}% commission on new bookings. Each booking keeps the rate it was made at.",
    levelTitle: "Your level: {{name}}",
    levelNotSet: "Level not set yet",
    levelSetBody: "Fynrox sets your level and fees. Clients pay {{gst}}% GST on top.",
    levelUnsetBody: "Fynrox will place you in a level. Clients can book you once it's set.",
    feeLine: "{{label}} · {{minutes}} min",
    feeNotSet: "fee not set",
    feeUpcoming: "{{price}} from {{date}}",
    payoutFailedBody_one:
      "{{amount}} across {{count}} settlement couldn't be transferred. The money is still owed to you and will be retried.",
    payoutFailedBody_other:
      "{{amount}} across {{count}} settlements couldn't be transferred. The money is still owed to you and will be retried.",
    monthBreakdown: "{{gross}} gross · {{commission}} commission",
    derivedNote:
      "This figure counts per-session bookings, which aren't part of how clients reach you right now. Your income appears in the settlements below instead.",
    settlements: "Settlements",
    settlementGross: "{{gross}} gross · {{pct}}% commission",
    paidOn: "Paid {{date}}",
    statusCopy: {
      eligible: "Earned, not yet approved for payout.",
      approved: "Approved — included in the next payout run.",
      pending: "In a payout run, on its way to your account.",
      paid: "Paid.",
      payout_failed: "The transfer didn't go through.",
    },
  },

  availability: {
    loadError: "Couldn't load your availability status.",
    lifecycleLabel: {
      application: "Application",
      verification: "Under Verification",
      approved: "Approved",
      available: "Open for New Clients",
      suspended: "Suspended",
    },
    activeOfMax: "{{active}} of {{max}}",
    roomForMore: "You have room for at least one more client right now.",
    atCapacity: "You're at capacity — raise your limit below to accept more clients.",
    needsAvailable: "New-client matching also requires Open for New Clients status, above.",
    capacityHelp: "The cap on how many clients can be active with you at once ({{min}}–{{max}}).",
    capacityInvalid: "Enter a whole number between {{min}} and {{max}}.",
    decrease: "Decrease maximum clients",
    increase: "Increase maximum clients",
    saved: "Saved",
    savedBody: "Your client capacity was updated.",
    saveFailed: "Couldn't save",
    tryAgain: "Please try again.",
  },

  formReviews: {
    title: "Form reviews",
    emptyTitle: "No clips yet",
    emptyBody: "Form-check clips from your clients will show up here.",
    exerciseUnknown: "Exercise not specified",
    needsReview: "Needs review",
    reviewed: "Reviewed",
    toReviewSection: "To review",
    reviewedSection: "Reviewed",
    detailTitle: "Form review",
    clipTitle: "Clip",
    detailsTitle: "Details",
    client: "Client",
    exercise: "Exercise",
    submittedLabel: "Submitted",
    reviewedLabel: "Reviewed",
    status: "Status",
    noVideo: "No video attached to this submission.",
    videoUnavailable: "This clip couldn't be played here. You can still write your feedback below.",
    noteLabel: "Your feedback",
    notePlaceholder: "Your feedback on their form",
    noteCount: "{{count}} / {{max}}",
    submit: "Submit review",
    update: "Update review",
    sent: "Review sent",
    sentBody: "Your client has been notified.",
    submitFailed: "Couldn't submit",
    tryAgain: "Please try again.",
  },
} as const;
