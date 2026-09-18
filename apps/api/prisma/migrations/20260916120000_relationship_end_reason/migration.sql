-- Gap §56 (16 Sep 2026) — the real coach accept/decline gate needs a real
-- reason field for a coach's decline action. Generated via `prisma migrate
-- diff` against the shared local dev DB (same non-interactive-sandbox
-- workaround gap §49/§50 already used: `prisma migrate dev` refuses to run
-- non-interactively) and hand-trimmed to ONLY this branch's own real
-- change — the raw diff also included DROP TABLE/DROP COLUMN/AlterEnum
-- statements for other parallel agents' own already-applied migrations on
-- this shared DB (consents, password_reset_tokens, safety_escalations,
-- SubscriptionStatus, subscriptions columns) that this worktree's own
-- schema.prisma doesn't know about — those were excluded, same "leave the
-- other pass's already-applied columns/tables completely untouched"
-- precedent gap §49 already documented for the exact same situation. No
-- SQL below was hand-typed beyond deleting those unrelated blocks.

-- AlterTable
ALTER TABLE "relationships" ADD COLUMN     "endReason" TEXT;
