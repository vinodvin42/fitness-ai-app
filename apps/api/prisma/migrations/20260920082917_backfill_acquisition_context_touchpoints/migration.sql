-- Data-only migration (R2 Wave 1, 20 Sep 2026) — backfills the
-- Source/Campaign/Touchpoint model's history for every user who already
-- has a raw `acquisitionContext` string (shape "gym:CODE" / "creator:CODE",
-- see apps/user-mobile/src/lib/acquisitionContext.ts). `User.acquisitionContext`
-- itself is left completely untouched by this migration — this is
-- additive, not a replacement.
--
-- Deliberately does NOT attempt to resolve the "gym:"/"creator:" prefix
-- against a real Campaign or (once it exists) Gym row: no Campaign rows
-- exist for these historical signups (Campaign is brand new this same
-- migration set), and guessing a resolution here would be fabricating
-- data, not preserving it — the same "ground it, don't guess" discipline
-- this codebase applies elsewhere. Every affected user instead gets one
-- honest, channel-only `direct` Touchpoint (occurredAt = the user's own
-- `createdAt`, the real historical moment this context was captured) —
-- the raw signal is preserved in the new model rather than lost, and a
-- later wave that ships real Gym-code resolution can re-derive a more
-- precise Campaign-linked Touchpoint from `User.acquisitionContext`
-- without this migration having destroyed anything.
INSERT INTO "touchpoints" ("id", "userId", "campaignId", "channel", "touchpointType", "occurredAt")
SELECT gen_random_uuid()::text, "id", NULL, 'direct'::"AcquisitionChannel", 'signup'::"TouchpointType", "createdAt"
FROM "users"
WHERE "acquisitionContext" IS NOT NULL;
