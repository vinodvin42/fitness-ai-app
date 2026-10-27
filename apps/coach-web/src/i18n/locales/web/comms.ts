/**
 * Web-only copy for the comms screens. English source; keys are referenced as
 * `web.comms.<key>`. Strings the old app already had stay in en.ts under their
 * original keys, so the two apps read the same.
 */
export const comms = {
  // Shared
  tryAgain: "Please try again.",

  // Calendar (strings the old Calendar hardcoded)
  calendarDescription: "Your booked sessions, grouped by day.",
  upcoming: "Upcoming",
  past: "Past",
  cancelled: "Cancelled",
  cancelledByClient: "Cancelled by client",
  durationMin: "{{count}} min",

  // Proposing a new time (27 Oct 2026)
  proposeTime: "Propose new time",
  proposeTitle: "Propose a new time",
  proposeIntro: "{{name}} gets a notice and can accept the new time, or decline and get a session credit. Until they answer, the session stays at {{when}}.",
  proposePickDay: "Day",
  proposePickTime: "Time",
  proposeNoSlots: "No free times on this day.",
  proposeSend: "Send to {{name}}",
  proposeSent: "New time sent to {{name}}",
  proposeTooLate: "A new time can be proposed up to 12 hours before the session.",
  proposedPending: "New time proposed: {{when}}",
  proposedWaiting: "Waiting for the client to answer.",
  withdraw: "Withdraw",
  withdrawn: "Proposal withdrawn",
  summaryChars: "{{count}}/{{max}}",

  // Messages list and thread (strings the old screens hardcoded)
  noMessagesYet: "No messages yet",
  sayHello: "No messages yet. Say hello to {{name}}.",
  pickConversation: "Pick a conversation",
  pickConversationHint: "Choose a client on the left to read and reply to their messages.",
  backToMessages: "Messages",
  unreadBadge_one: "{{count}} unread message",
  unreadBadge_other: "{{count}} unread messages",
  moreOptions: "More options for {{name}}: report or block",
  reportName: "Report {{name}}",
  block: "Block",
  unblock: "Unblock",
  blockTitle: "Block {{name}}?",
  blockBody: "Neither of you will be able to send messages here. Their coaching isn't changed.",
  blockedByMe: "You blocked {{name}}. Messages are off in this conversation.",
  blockedOff: "Messages are off in this conversation.",
  reportMessage: "Report this message",
  sendFailed: "Message not sent",
  actionFailed: "That didn't work",
  reportSent: "Report sent",
  reportSentBody: "Thanks for telling us. Fynrox's safety team will review it.",
  reportFailed: "Report not sent",
  composerHint: "Enter to send, Shift+Enter for a new line",
  messageLabel: "Message {{name}}",

  // Report dialog (strings the old ReportSheet hardcoded)
  reportTitle: "Report {{subject}}",
  thisMessage: "this message",
  reportIntro: "Fynrox's safety team will review it. They won't tell the client who reported them.",
  reportReason: "Why are you reporting?",
  reasonHarassment: "Harassment or bullying",
  reasonSexualContent: "Sexual or inappropriate content",
  reasonThreatsOrHate: "Threats or hate",
  reasonSpamOrScam: "Spam or scam",
  reasonImpersonation: "Pretending to be someone else",
  reasonOther: "Something else",
  reportDetails: "More details, optional",
  reportDetailsPlaceholder: "Anything else we should know? (optional)",
  sendReport: "Send report",

  // Inbox (strings the old Notifications screen hardcoded)
  inboxDescription: "Requests, offers, bookings and messages that need you.",
  requestedAgo: "Requested {{ago}}",
  stuckSince: "Stuck since {{ago}}",
  newBookingsHint: "Booked since you last opened your inbox.",

  // Activity feed (the coach inbox model, 26 Oct 2026)
  activityTitle: "Activity",
  activityHint: "Everything Fynrox told you, newest first.",
  markAllRead: "Mark all as read",
  noActivity: "Nothing yet. Requests, bookings, verification decisions and payouts will show up here.",
  loadMore: "Show older",
  unreadDot: "Unread",
} as const;
