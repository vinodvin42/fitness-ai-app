-- CreateEnum
CREATE TYPE "CheckInPeriod" AS ENUM ('daily', 'weekly');

-- CreateTable
CREATE TABLE "check_ins" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "period" "CheckInPeriod" NOT NULL,
    "periodKey" TEXT NOT NULL,
    "energy" INTEGER NOT NULL,
    "soreness" INTEGER NOT NULL,
    "adherence" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "check_ins_userId_createdAt_idx" ON "check_ins"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "check_ins_userId_period_periodKey_key" ON "check_ins"("userId", "period", "periodKey");

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
