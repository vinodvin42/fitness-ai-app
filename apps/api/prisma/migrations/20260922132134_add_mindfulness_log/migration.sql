-- CreateTable
CREATE TABLE "mindfulness_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "type" TEXT,
    "note" TEXT,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mindfulness_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mindfulness_logs_userId_loggedAt_idx" ON "mindfulness_logs"("userId", "loggedAt");

-- AddForeignKey
ALTER TABLE "mindfulness_logs" ADD CONSTRAINT "mindfulness_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
