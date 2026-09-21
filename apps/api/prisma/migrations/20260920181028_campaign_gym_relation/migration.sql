-- CreateIndex
CREATE INDEX "campaigns_gymId_idx" ON "campaigns"("gymId");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
