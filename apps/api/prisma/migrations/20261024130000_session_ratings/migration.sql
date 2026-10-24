-- "How was your session?" (Figma coach/11, 24 Oct 2026): a private 1-5 rating per booking, seen only by that coach.
-- CreateTable
CREATE TABLE "session_ratings" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "session_ratings_bookingId_key" ON "session_ratings"("bookingId");

-- CreateIndex
CREATE INDEX "session_ratings_professionalId_createdAt_idx" ON "session_ratings"("professionalId", "createdAt");

-- AddForeignKey
ALTER TABLE "session_ratings" ADD CONSTRAINT "session_ratings_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_ratings" ADD CONSTRAINT "session_ratings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_ratings" ADD CONSTRAINT "session_ratings_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

