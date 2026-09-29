/**
 * English source catalogue for the creator partner portal.
 *
 * Keys are `screen.element`, matching the screen's own file name.
 *
 * Deliberately NOT here: product names (FynroX), and anything the API
 * sends back — a campaign name, a link code, a status string the server
 * already worded. Those are the API's to translate.
 *
 * Only `en` exists; the other nine resolve through `fallbackLng` until
 * translations are written.
 */
export const en = {
  shell: {
    portalName: "Creator Portal",
    // Repeated in the sidebar footer on every screen, because the
    // boundary is the single thing a partner most often misremembers.
    commercialOnly: "Commercial data only — never a member's identity, training, food or health data.",
    signOut: "Sign out",
  },

  nav: {
    dashboard: "Dashboard",
    campaigns: "Campaigns",
    referralTools: "Referral tools",
    commission: "Commission",
    agreement: "Agreement",
    account: "Account",
  },

  login: {
    email: "Email",
    password: "Password",
    submit: "Sign in",
    submitting: "Signing in…",
    noAccess: "No portal access yet? Ask your FynroX contact to grant one.",
  },

  // No `title` in these five: each screen's heading IS its nav label,
  // and one string with two keys is one string a translator pays for
  // twice and two places for them to drift apart.
  dashboard: {
    yourProfile: "Your profile",
    yourCampaigns: "Your campaigns & link codes",
    noCampaigns: "No campaigns are credited to you yet — ask your FynroX contact.",
    linkCode: "Link code",
    campaign: "Campaign",
    attribution: "Your attribution (all-time)",
    registrations: "Registrations",
    activated: "Activated",
    firstWorkout: "First workout",
    paidConversions: "Paid conversions",
    payoutHistory: "Your payout history",
    noPayouts: "No payouts recorded yet.",
    paid: "Paid",
    pending: "Pending",
    totalPayouts: "Total payouts",
  },

  campaigns: {
    empty: "No campaigns are credited to you yet — your FynroX contact will set one up and it'll appear here.",
    totalsOnly:
      "Campaign performance is reported as totals only. FynroX never shares who signed up, what they train, what they eat, or anything about their health.",
  },

  referralTools: {
    empty: "No campaigns yet — your FynroX contact will set one up and your links will appear here.",
    notLive:
      "This link isn't live right now, so anyone who follows it sees an unavailable page. Check with your FynroX contact before you post it.",
    copyLink: "Copy link",
    downloadQr: "Download QR",
    // The code is interpolated rather than concatenated around a <span>:
    // a sentence with a styled fragment in the middle does not survive
    // translation, because word order moves.
    codeLine: "Code: {{code}} — people can type this in the app if they'd rather not follow a link.",
  },

  commission: {
    paid: "Paid",
    pending: "Pending",
    underReview: "Under review",
    payoutFailed: "A payout to you didn't go through",
    payoutFailedNote:
      "The commission is still owed to you and will be included in the next payout run. If your bank or UPI details have changed, send them to your FynroX contact.",
    empty: "No commission yet. Once someone subscribes through one of your links, it'll appear here.",
  },

  agreement: {
    title: "Agreement & terms",
    status: "Partnership status",
    commercialTerms: "Commercial terms",
    commissionRate: "Commission rate",
    appliesTo: "Applies to",
    appliesToValue: "Subscriptions started through your links",
    payoutSchedule: "Payout schedule",
    payoutScheduleValue: "Monthly, after approval",
    refundNote: "Commission is reversed if the subscription is refunded",
    creatorAgreement: "Creator agreement",
    // D13 is still open; this says so rather than showing a placeholder
    // document as though it were the real one.
    draftNote:
      "The full creator agreement is still with our legal team and isn't published yet. Your FynroX contact has the current draft — nothing here replaces what you signed.",
    signedNote: "Your signed creator agreement governs this partnership. Contact your FynroX contact for a copy.",
  },

  account: {
    yourDetails: "Your details",
    payoutDetails: "Payout details",
    // D5 has no payout provider, so the details are collected by a human
    // on purpose — stated rather than hidden behind a disabled form.
    payoutNote:
      "We collect bank or UPI details directly with your FynroX contact rather than through this portal, so they never sit in a form. If a payout fails, that is who to talk to.",
    support: "Support",
    boundary:
      "We can't answer questions about individual members — who they are, what they train, or anything they log. That applies to everyone, including partners.",
  },
} as const;

export type TranslationCatalogue = typeof en;
