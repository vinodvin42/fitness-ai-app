-- Why a member cancelled (Figma payments/07, 24 Oct 2026). Optional feedback; access is unchanged.
ALTER TABLE "subscriptions" ADD COLUMN "cancelReason" TEXT,
ADD COLUMN "cancelComment" TEXT,
ADD COLUMN "cancelRequestedAt" TIMESTAMP(3);
