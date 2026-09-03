# Inferred Data Model — Coach App

Same caveat as the other two data-model docs: reverse-engineered from screens, not authoritative.

## 1. Entities

- `Coach` (= `Professional` in [../06-data-model.md](../admin/06-data-model.md), = `Coach` in [../mobile/05-data-model.md](../mobile/05-data-model.md)) — name, email, phone, password/auth, **services offered** (multi-select: Fitness, Nutrition), bio, specialization tags, years of experience, avatar.
- `CoachCredential` — **one per service type**: certification name, certifying body, year obtained, uploaded documents (certification doc, qualification certificate), a shared KYC identity document (Aadhaar), and an independent verification status per service (verified/not verified/pending).
- `CoachServiceOffering` — a priced, timed service a coach sells (e.g. "Fitness Coaching, 45 min, ₹800"; "Combined Session, 60 min, ₹1,200") — a coach can offer several.
- `ClientRelationship` (= `Relationship` in [../06-data-model.md](../admin/06-data-model.md)) — links a Coach to a user for a specific service, with status (active), last/next session dates.
- `TrainingProgram` (client-scoped) — name, focus area, week X of Y, a this-week checklist of workouts with completion state.
- `Booking` (= part of `CoachBooking` in [../mobile/05-data-model.md](../mobile/05-data-model.md)) — coach, service offering, date, time slot, duration, amount paid, status.
- `ProfessionalChangeRequest` (= `RelationshipChangeRequest` in [../06-data-model.md](../admin/06-data-model.md)) — current coach, reason (schedule conflict / different specialization / other), submitted by the user, presumably reviewed via the admin console's Change/Intervention Queue (04.03).

## 2. This file confirms and sharpens the admin-console data model

The credential/verification structure observed here — **per-service credentials, per-service verification status, a shared KYC step** — should directly inform (and correct, if needed) the `Credential` entity in [../06-data-model.md](../admin/06-data-model.md): credentials are not one record per professional, but one per **(professional, service type)** pair, plus one shared identity-verification record. Update the admin data model doc to reflect this once confirmed with backend.

## 3. Open modeling question this file adds

Is a `Booking` (this file, and the consumer app's `CoachBooking`) a standalone transactional record, or does booking a session create/extend a `ClientRelationship`/`Relationship`? The "My Professional Team" screen shows ongoing relationships with recurring "last/next session" dates and a persistent Message/Book Session/Change relationship, suggesting a booking is one event *within* an ongoing relationship rather than the relationship itself — consistent with the admin console's Relationship Directory (04.01), which tracks session/payment counts per relationship over time. Recommend modeling `Relationship` as the parent object and `Booking`/session as a child, not two independent top-level entities — see [../mobile/06-cross-app-integration.md](../mobile/06-cross-app-integration.md) §2 for the related open item.
