/**
 * Web-only copy for the settings, profile and onboarding screens. English source; keys are referenced as
 * `web.settings.<key>`. Strings the old app already had stay in en.ts under their
 * original keys, so the two apps read the same.
 *
 * The onboarding strings below were hardcoded in apps/coach-mobile's
 * onboarding screens and components; the wording is unchanged.
 */
export const settings = {
  profile: {
    description: "Your photo, languages and gender. Members see these on your profile and use them to find a coach.",
    photoAlt: "Your profile photo",
    photoNotImage: "Choose an image file (JPG or PNG).",
    appearanceTitle: "Appearance",
    appearanceHelp: "Light, dark, or follow this device. Saved in this browser.",
  },

  help: {
    description: "Questions about clients, payouts or your account.",
    emailButton: "Email support",
    address: "support@fynrox.com",
    includeTitle: "To help us reply faster",
    includeAccount: "Send it from the email you sign in with.",
    includeWho: "Name the client, session or payout it's about.",
    includeScreenshot: "Attach a screenshot if something looks wrong.",
  },

  more: {
    coaching: "Coaching",
    business: "Business",
    inbox: { label: "Inbox", subtitle: "Requests, bookings, offers and unread messages" },
    appearance: "Appearance",
    openProfile: "Open your profile",
  },

  onboarding: {
    stepOf: "Step {{step}} of {{total}} — {{label}}",
    continue: "Continue",
    nextService: "Next Service",
    fitnessSubtitle: "Workouts, posture guides, strength protocols, physical fitness coaching",
    nutritionSubtitle: "Nutrition plans, food logging guidance, meal coaching, dietary goal tracking",
    saveServicesFailed: "Couldn't save your services. Check your connection and try again.",
    credentialsStep: "Credential Verification — {{index}} of {{count}}",
    credentialsTitle: "{{service}} credentials",
    certificationHint: "A photo or scan of your certification.",
    qualificationHint: "A photo or scan of your qualification certificate.",
    submitCredentialFailed: "Couldn't submit your credentials. Check your connection and try again.",
    submitKycFailed: "Couldn't submit your ID. Check your connection and try again.",
    kycDocument: "Government ID",
    kycHint: "A clear photo or scan of the front of your ID.",
    takePhoto: "Take Photo",
    retakePhoto: "Retake Photo",
    uploadFile: "Upload File",
    replace: "Replace",
    formats: "JPG, PNG or PDF, up to about 4 MB.",
    fileTooLarge: "That file is too large. Use one under about 4 MB.",
    fileUnreadable: "Couldn't read that file. Use a JPG, PNG or PDF.",
    previewAlt: "Preview of {{name}}",
    noServicesTitle: "No services to upload for",
    noServicesBody: "Choose your services first, then add their credentials.",
    signOut: "Sign out",
  },
} as const;
