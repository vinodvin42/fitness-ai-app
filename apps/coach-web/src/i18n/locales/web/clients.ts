/**
 * Web-only copy for the clients screens. English source; keys are referenced as
 * `web.clients.<key>`. Strings the old app already had stay in en.ts under their
 * original keys, so the two apps read the same.
 */
export const clients = {
  // Clients list
  description: "Everyone you're actively coaching.",
  searchLabel: "Search clients",
  searchPlaceholder: "Search by name",
  noMatchTitle: "No clients match \"{{query}}\"",
  noMatchBody: "Check the spelling, or clear the search to see everyone.",
  clearSearch: "Clear search",
  waiting_one: "{{count}} request or offer waiting",
  waiting_other: "{{count}} requests or offers waiting",
  review: "Review",
  sessions: "Sessions",
  next: "Next",
  last: "Last",
  none: "—",
  clientCount_one: "{{count}} client",
  clientCount_other: "{{count}} clients",

  // Requests & offers
  requestsDescription: "Answer new clients who asked for you, and clients Fynrox proposed you for.",
  backToClients: "Clients",
  requestedOn: "{{service}} · Requested {{date}}",
  proposedOn: "{{service}} · Proposed {{date}}",
  expiresOn: "Expires {{date}}",
  offerHistory: "Offer history",
  acceptedTitle: "Request accepted",
  acceptedBody:
    "{{name}} has been told and has {{hours}} hours to complete payment. They'll appear under Clients, and you can message them, once they pay.",
  acceptFailed: "Couldn't accept this request",
  declineFailed: "Couldn't decline this request",
  acceptOfferFailed: "Couldn't accept this offer",
  declineOfferFailed: "Couldn't decline this offer",
  tryAgain: "Please try again.",
  declineRequestTitle: "Decline this request?",
  declineRequestBody:
    "{{name}} won't be notified of a reason unless you add one later — they'll see this request was declined.",
  declineOfferTitle: "Decline this offer?",
  declineOfferBody: "Fynrox proposed {{name}} as a new client. Declining won't notify them of a reason.",
  requestDeclined: "Request declined",
  offerAccepted: "Offer accepted",
  offerDeclined: "Offer declined",

  // Offers history
  offersBack: "Requests & offers",
  filterLabel: "Show offers",
  filterOffered: "Open",
  filterAccepted: "Accepted",
  filterDeclined: "Declined",
  filterExpired: "Expired",
  accepted: "Accepted",
  emptyOfferedTitle: "No open offers",
  emptyOfferedBody: "When Fynrox proposes you as a client's professional, it'll appear here to accept or decline.",
  emptyAcceptedTitle: "Nothing accepted yet",
  emptyAcceptedBody: "Offers you take on will be listed here.",
  emptyDeclinedTitle: "Nothing declined",
  emptyDeclinedBody: "Offers you turn down stay here for your own record.",
  emptyExpiredTitle: "Nothing expired",
  emptyExpiredBody: "An offer you don't answer within 48 hours goes back to Fynrox to re-match.",
  expiringNow: "Expiring now — this goes back to Fynrox to re-match.",
  hoursLeft_one: "{{count}} hour left before this returns to Fynrox.",
  hoursLeft_other: "{{count}} hours left before this returns to Fynrox.",
  offerAcceptFailedTitle: "Couldn't accept",
  offerAcceptFailedBody: "This offer may have expired or been withdrawn. Refresh the page to see the latest.",
  offerDeclineFailedTitle: "Couldn't decline",
  offerDeclineFailedBody: "This offer may have already been acted on.",
  noReasonTold: "{{name}} won't be told a reason — only that we're finding someone else.",
} as const;
