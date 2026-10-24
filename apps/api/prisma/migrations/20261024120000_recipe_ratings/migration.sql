-- "How was it?" after cooking a recipe (Figma fuel/17, 24 Oct 2026): one private rating per member and recipe.
-- CreateTable
CREATE TABLE "recipe_ratings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recipe_ratings_recipeId_idx" ON "recipe_ratings"("recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_ratings_userId_recipeId_key" ON "recipe_ratings"("userId", "recipeId");

-- AddForeignKey
ALTER TABLE "recipe_ratings" ADD CONSTRAINT "recipe_ratings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ratings" ADD CONSTRAINT "recipe_ratings_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

