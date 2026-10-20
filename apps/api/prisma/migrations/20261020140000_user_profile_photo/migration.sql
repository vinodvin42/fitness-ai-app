-- Profile photo (20 Oct 2026): the member's own picture, taken with the camera or chosen from the
-- gallery in the app. Additive only: one new table, one row per member, deleted with the account.
-- See the UserProfilePhoto model in schema.prisma.

-- CreateTable
CREATE TABLE "user_profile_photos" (
    "userId" TEXT NOT NULL,
    "imageData" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profile_photos_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "user_profile_photos" ADD CONSTRAINT "user_profile_photos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
