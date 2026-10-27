/**
 * Web-only copy for Client Profile and Client Recommendations. English source;
 * keys are referenced as `web.clientProfile.<key>`. Strings the old app already
 * had in its catalogue stay in en.ts under their original keys
 * (clients.profile.*, clients.recommendations.*, sessionSummary.*); the ones it
 * hardcoded in JSX live here, worded the same.
 */
export const clientProfile = {
  backToClients: "Clients",
  clientFallback: "Client",
  clientSince: "Client since {{date}}",
  tabsLabel: "Client profile sections",
  tabOverview: "Overview",
  tabSessions: "Sessions",
  tabActivity: "Activity",
  tabNotes: "Notes",
  message: "Message",
  quickActions: "Quick actions",
  tryAgain: "Please try again.",

  // Overview
  levelBeginner: "Beginner",
  levelIntermediate: "Intermediate",
  levelAdvanced: "Advanced",
  statCompleted: "Sessions completed",
  statUpcoming: "Upcoming sessions",
  recommendationsTitle: "Plan recommendations",
  recommendationsHint: "Approve or reject what the AI plan engine suggests for this client.",
  feedbackTitle: "Session feedback",
  feedbackSummary_one: "{{average}} of 5 across {{count}} session · only you see this",
  feedbackSummary_other: "{{average}} of 5 across {{count}} sessions · only you see this",
  starsLabel: "{{count}} of 5 stars",

  // Sessions
  sessionsTitle: "Sessions",
  completedCount: "{{count}} completed",
  upcoming: "Upcoming",
  recent: "Recent",
  noRecent: "No past sessions yet.",
  cancelled: "Cancelled",

  // Activity
  noConsent:
    "This client hasn't enabled data sharing with their coach yet, so training, nutrition, and check-in activity aren't shown here. They can turn this on anytime from their own Privacy settings.",
  training: "Training",
  trainingCount: "{{completed}} of {{total}} recent sessions completed",
  workout: "Workout",
  nutrition: "Nutrition",
  mealLine: "{{meal}} · {{calories}} kcal",
  checkIns: "Check-ins",
  checkInLine: "Energy {{energy}} · Soreness {{soreness}} · Adherence {{adherence}}",
  weightKg: "{{value}} kg",
  weightNotSet: "Weight not set",

  // Notes
  noteNotSaved: "Note not saved",
  noteNotUpdated: "Note not updated",
  noteNotDeleted: "Note not deleted",
  deleteNoteTitle: "Delete note?",
  deleteNoteBody: "This can't be undone.",
  delete: "Delete",
  edit: "Edit",
  editNoteLabel: "Edit note",
  newNoteLabel: "New private note",

  // Relationship actions
  relationship: "Relationship",
  done: "Done",
  ended: "This relationship has ended.",
  completed: "Programme marked complete. This client's access has ended.",
  handedOver: "This relationship has ended and the replacement coach has been sent an offer for this client.",
  endFailed: "Couldn't end this relationship",
  completeFailed: "Couldn't complete this programme",
  handoverFailed: "Couldn't complete the handover",
  formService: "{{service}} coaching with {{name}}",
  reasonLabel: "Reason",
  continue: "Continue",
  yearsExp: "{{count}}y exp",
  confirmHandoverTitle: "Confirm handover",
  confirmCompleteTitle: "Confirm programme complete",
  confirmEndTitle: "Confirm end relationship",
  confirmHandoverReplacement:
    "This ends your relationship with this client and sends the replacement coach a real offer for them. This can't be undone from here.",
  confirmComplete:
    "This marks the programme finished and ends your access to this client's data. They'll see a completion summary. This can't be undone from here.",
  confirmEnd: "This ends your relationship with this client. This can't be undone from here.",
  handOver: "Hand Over",
  complete: "Complete",
  completeCoaching: "Complete Coaching",
  endRelationship: "End Relationship",

  // Safety flag
  safetyTitle: "Safety",
  safetyIntro: "Worried about {{name}}'s safety or wellbeing? Raise it here rather than in chat — chat isn't monitored.",
  safetyConcernLabel: "Your concern",
  safetyUrgent: "This needs attention today",
  safetyUrgentNote:
    "This raises the priority of the review. It does not alert anyone immediately. If someone is in immediate danger, call emergency services.",
  safetyMinLength: "Write at least 10 characters.",
  flagRaisedTitle: "Flag raised",
  flagRaised: "Our safety team has been notified and will review this. You'll be contacted if they need anything from you.",
  flagFailed: "Couldn't raise the flag",

  // Report and block (same copy as the chat thread's menu)
  reportClient: "Report {{name}}",
  reportTitle: "Report {{subject}}",
  reportIntro: "Fynrox's safety team will review it. They won't tell the client who reported them.",
  reportReasonsLabel: "Why are you reporting?",
  reasonHarassment: "Harassment or bullying",
  reasonSexualContent: "Sexual or inappropriate content",
  reasonThreatsOrHate: "Threats or hate",
  reasonSpamOrScam: "Spam or scam",
  reasonImpersonation: "Pretending to be someone else",
  reasonOther: "Something else",
  reportDetailsPlaceholder: "Anything else we should know? (optional)",
  reportDetailsLabel: "More details, optional",
  sendReport: "Send report",
  reportSent: "Report sent",
  reportSentBody: "Thanks for telling us. Fynrox's safety team will review it.",
  reportFailed: "Report not sent",
  block: "Block {{name}}",
  unblock: "Unblock {{name}}",
  blockTitle: "Block {{name}}?",
  blockBody: "Neither of you will be able to send messages here. Their coaching isn't changed.",
  blockConfirm: "Block",
  blockFailed: "That didn't work",
  blockedByMe: "You blocked {{name}}. Messages are off in this conversation.",
  blockedByThem: "Messages are off in this conversation.",

  // Recommendations screen
  recsTitle: "{{name}}'s Recommendations",
  continuePlan: "Continue Current Plan",
  switchTo: "Switch to {{program}}",
  aNewProgram: "a new program",
  approve: "Approve",
  approveSwitch: "Approve & Switch",
  decideFailed: "Couldn't save this decision",
} as const;
