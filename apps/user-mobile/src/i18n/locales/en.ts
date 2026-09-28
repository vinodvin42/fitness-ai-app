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
    loading: "Loading…",
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
  },

  more: {
    rows: {
      progress: { label: "Progress", subtitle: "Measurements, photos & check-ins" },
      timeline: { label: "Timeline", subtitle: "Milestones & PRs" },
      coaching: { label: "Coaching", subtitle: "Request, status & your team" },
      subscription: { label: "Subscription", subtitle: "Plan & payments" },
      purchases: { label: "Purchases", subtitle: "Receipts & refund status" },
      reminders: { label: "Reminders", subtitle: "Workout, meal & water nudges" },
      referral: { label: "Refer & Invite", subtitle: "Earn free months" },
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
