-- Guidance requests carry what the member asked for (Figma coach/02, 05, 07, 25 Oct 2026): the service, a preferred day and a note, when it was requested and when the coach accepted.
ALTER TABLE "relationships"
  ADD COLUMN "requestedOfferingId" TEXT,
  ADD COLUMN "preferredDate" TIMESTAMP(3),
  ADD COLUMN "requestNote" TEXT,
  ADD COLUMN "requestedAt" TIMESTAMP(3),
  ADD COLUMN "acceptedAt" TIMESTAMP(3);
