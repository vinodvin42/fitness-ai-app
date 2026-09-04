/**
 * Seed recipes — see ../seedDatabase.ts for how these are written.
 *
 * Grew from 4 to 13 and then to 42 on 4 Sep 2026, spread across the four meal
 * slots a MealLog can be filed under so that Nutrition's per-meal views are
 * never empty. The four original ids and macros are unchanged.
 *
 * Macros are realistic per-serving figures for the dish named, and are
 * internally consistent (protein and carbs at 4 kcal/g, fat at 9, summing to
 * roughly the stated calories). They are not measured laboratory values and
 * this is not a food database — it is seed content for a build whose real
 * nutrition data will come from the admin CMS.
 *
 * `tags` are what Recipe search matches on besides the name, so they are kept
 * to a small controlled vocabulary — dietary pattern (vegetarian, vegan,
 * pescatarian, gluten-free), macro emphasis (high-protein, high-fiber,
 * low-carb), and effort (quick, meal-prep) — rather than free-text keywords.
 *
 * Images were re-picked on 4 Sep 2026 by searching each recipe's own title and
 * scoring candidates on whether the photo's description actually contains the
 * dish's distinctive words, rather than by eyeballing the first plausible
 * result. That is why most of these now show the named dish — curry, falafel,
 * a caesar salad — instead of a generic plate of food. One exception is worth
 * knowing about rather than hiding: `rec-tuna-salad` keeps a generic composed
 * salad, because the library has no free photo of a Nicoise, and reshaping the
 * recipe to fit an available stock photo would be the wrong way round.
 */
import { unsplash } from "./images";
import type { SeedRecipe } from "./types";

export const seedRecipes: SeedRecipe[] = [
  // ---- Breakfast ---------------------------------------------------------
  { id: "rec-oats", name: "Overnight Oats", mealType: "breakfast", calories: 350, proteinG: 14, carbsG: 52, fatG: 9, prepTimeMinutes: 5, tags: ["vegetarian", "high-fiber", "meal-prep"], imageUrl: unsplash("photo-1552842016-443bcee0667b") },
  { id: "rec-avocado-toast", name: "Avocado & Egg Toast", mealType: "breakfast", calories: 410, proteinG: 18, carbsG: 32, fatG: 24, prepTimeMinutes: 10, tags: ["vegetarian", "high-protein", "quick"], imageUrl: unsplash("photo-1772717737730-85eff61606c8") },
  { id: "rec-yogurt-parfait", name: "Greek Yogurt Parfait", mealType: "breakfast", calories: 300, proteinG: 24, carbsG: 38, fatG: 6, prepTimeMinutes: 5, tags: ["vegetarian", "high-protein", "quick"], imageUrl: unsplash("photo-1649118173382-dad295004282") },
  { id: "rec-protein-pancakes", name: "Protein Pancakes", mealType: "breakfast", calories: 380, proteinG: 28, carbsG: 44, fatG: 10, prepTimeMinutes: 15, tags: ["vegetarian", "high-protein"], imageUrl: unsplash("photo-1612182062633-9ff3b3598e96") },
  { id: "rec-veggie-omelette", name: "Veggie Omelette", mealType: "breakfast", calories: 320, proteinG: 24, carbsG: 8, fatG: 21, prepTimeMinutes: 12, tags: ["vegetarian", "high-protein", "low-carb", "gluten-free"], imageUrl: unsplash("photo-1677844592730-ce9c936d8f1a") },
  { id: "rec-eggs-spinach", name: "Scrambled Eggs & Spinach", mealType: "breakfast", calories: 290, proteinG: 22, carbsG: 6, fatG: 20, prepTimeMinutes: 10, tags: ["vegetarian", "high-protein", "low-carb", "quick", "gluten-free"], imageUrl: unsplash("photo-1787761460205-8ff8c81b7558") },
  { id: "rec-breakfast-burrito", name: "Breakfast Burrito", mealType: "breakfast", calories: 520, proteinG: 30, carbsG: 48, fatG: 22, prepTimeMinutes: 15, tags: ["high-protein"], imageUrl: unsplash("photo-1711488735428-27c6757beb5c") },
  { id: "rec-muesli", name: "Muesli & Milk", mealType: "breakfast", calories: 340, proteinG: 13, carbsG: 55, fatG: 8, prepTimeMinutes: 3, tags: ["vegetarian", "high-fiber", "quick"], imageUrl: unsplash("photo-1658402218013-18ccf3336bb5") },
  { id: "rec-cottage-cheese-bowl", name: "Cottage Cheese & Fruit Bowl", mealType: "breakfast", calories: 280, proteinG: 26, carbsG: 26, fatG: 7, prepTimeMinutes: 5, tags: ["vegetarian", "high-protein", "quick", "gluten-free"], imageUrl: unsplash("photo-1753173301157-8136a70b4178") },
  { id: "rec-pb-banana-smoothie", name: "Peanut Butter Banana Smoothie", mealType: "breakfast", calories: 420, proteinG: 24, carbsG: 48, fatG: 15, prepTimeMinutes: 5, tags: ["vegetarian", "high-protein", "quick"], imageUrl: unsplash("photo-1685967836529-b0e8d6938227") },

  // ---- Lunch -------------------------------------------------------------
  { id: "rec-chicken-bowl", name: "Grilled Chicken Bowl", mealType: "lunch", calories: 520, proteinG: 45, carbsG: 48, fatG: 15, prepTimeMinutes: 20, tags: ["high-protein", "meal-prep"], imageUrl: unsplash("photo-1788227372897-49ec292a9406") },
  { id: "rec-quinoa-salad", name: "Quinoa Chickpea Salad", mealType: "lunch", calories: 450, proteinG: 18, carbsG: 60, fatG: 16, prepTimeMinutes: 15, tags: ["vegan", "vegetarian", "high-fiber", "meal-prep"], imageUrl: unsplash("photo-1763000215238-38350d3e41ac") },
  { id: "rec-turkey-wrap", name: "Turkey & Hummus Wrap", mealType: "lunch", calories: 430, proteinG: 32, carbsG: 40, fatG: 14, prepTimeMinutes: 10, tags: ["high-protein", "quick"], imageUrl: unsplash("photo-1752095809096-f09d22c466c5") },
  { id: "rec-tuna-salad", name: "Tuna Nicoise Salad", mealType: "lunch", calories: 420, proteinG: 36, carbsG: 24, fatG: 20, prepTimeMinutes: 20, tags: ["pescatarian", "high-protein", "gluten-free"], imageUrl: unsplash("photo-1604909052743-94e838986d24") },
  { id: "rec-caesar-salad", name: "Chicken Caesar Salad", mealType: "lunch", calories: 470, proteinG: 40, carbsG: 18, fatG: 27, prepTimeMinutes: 15, tags: ["high-protein", "low-carb"], imageUrl: unsplash("photo-1782839577893-da9383e55c96") },
  { id: "rec-lentil-soup", name: "Lentil Soup", mealType: "lunch", calories: 360, proteinG: 20, carbsG: 54, fatG: 7, prepTimeMinutes: 35, tags: ["vegan", "vegetarian", "high-fiber", "meal-prep"], imageUrl: unsplash("photo-1620791144170-8a443bf37a33") },
  { id: "rec-falafel-bowl", name: "Falafel Bowl", mealType: "lunch", calories: 510, proteinG: 19, carbsG: 62, fatG: 21, prepTimeMinutes: 25, tags: ["vegan", "vegetarian", "high-fiber"], imageUrl: unsplash("photo-1718801594202-87766a1d5ce5") },
  { id: "rec-poke-bowl", name: "Salmon Poke Bowl", mealType: "lunch", calories: 540, proteinG: 38, carbsG: 56, fatG: 18, prepTimeMinutes: 20, tags: ["pescatarian", "high-protein", "omega-3"], imageUrl: unsplash("photo-1674655491431-ab599ebe3c06") },
  { id: "rec-egg-salad-sandwich", name: "Egg Salad Sandwich", mealType: "lunch", calories: 440, proteinG: 22, carbsG: 38, fatG: 22, prepTimeMinutes: 10, tags: ["vegetarian", "quick"], imageUrl: unsplash("photo-1742510980394-9859ba400ce1") },
  { id: "rec-shrimp-rice-bowl", name: "Shrimp Rice Bowl", mealType: "lunch", calories: 480, proteinG: 36, carbsG: 62, fatG: 9, prepTimeMinutes: 20, tags: ["pescatarian", "high-protein", "gluten-free"], imageUrl: unsplash("photo-1761314025611-957a20e3e8a3") },
  { id: "rec-mezze-plate", name: "Mediterranean Mezze Plate", mealType: "lunch", calories: 460, proteinG: 16, carbsG: 48, fatG: 23, prepTimeMinutes: 15, tags: ["vegetarian", "high-fiber"], imageUrl: unsplash("photo-1786174045057-89e6449f47d9") },
  { id: "rec-chicken-pesto-pasta", name: "Chicken Pesto Pasta", mealType: "lunch", calories: 620, proteinG: 42, carbsG: 62, fatG: 22, prepTimeMinutes: 25, tags: ["high-protein", "meal-prep"], imageUrl: unsplash("photo-1743615242147-017a3d712696") },

  // ---- Dinner ------------------------------------------------------------
  { id: "rec-salmon", name: "Baked Salmon & Greens", mealType: "dinner", calories: 480, proteinG: 38, carbsG: 20, fatG: 26, prepTimeMinutes: 25, tags: ["pescatarian", "high-protein", "omega-3", "gluten-free"], imageUrl: unsplash("photo-1539136788836-5699e78bfc75") },
  { id: "rec-tofu-stirfry", name: "Tofu Veggie Stir-Fry", mealType: "dinner", calories: 400, proteinG: 24, carbsG: 42, fatG: 14, prepTimeMinutes: 20, tags: ["vegan", "vegetarian", "high-fiber"], imageUrl: unsplash("photo-1785031765104-9af3d84fd3ff") },
  { id: "rec-beef-sweet-potato", name: "Lean Beef & Sweet Potato", mealType: "dinner", calories: 560, proteinG: 42, carbsG: 45, fatG: 22, prepTimeMinutes: 30, tags: ["high-protein", "gluten-free"], imageUrl: unsplash("photo-1778784153322-9b20b164012c") },
  { id: "rec-chicken-curry", name: "Chicken Curry & Rice", mealType: "dinner", calories: 610, proteinG: 40, carbsG: 68, fatG: 19, prepTimeMinutes: 35, tags: ["high-protein", "meal-prep", "gluten-free"], imageUrl: unsplash("photo-1708782344490-9026aaa5eec7") },
  { id: "rec-turkey-meatballs", name: "Turkey Meatballs & Zoodles", mealType: "dinner", calories: 420, proteinG: 40, carbsG: 18, fatG: 21, prepTimeMinutes: 30, tags: ["high-protein", "low-carb", "gluten-free"], imageUrl: unsplash("photo-1678684274579-01bb82b92367") },
  { id: "rec-baked-cod", name: "Baked Cod & Potatoes", mealType: "dinner", calories: 450, proteinG: 40, carbsG: 44, fatG: 12, prepTimeMinutes: 35, tags: ["pescatarian", "high-protein", "gluten-free"], imageUrl: unsplash("photo-1644784643137-b9073dd262f6") },
  { id: "rec-beef-stirfry", name: "Beef & Broccoli Stir-Fry", mealType: "dinner", calories: 530, proteinG: 42, carbsG: 40, fatG: 22, prepTimeMinutes: 25, tags: ["high-protein"], imageUrl: unsplash("photo-1783375175952-705a0600e05c") },
  { id: "rec-veggie-chili", name: "Veggie Chili", mealType: "dinner", calories: 390, proteinG: 20, carbsG: 58, fatG: 9, prepTimeMinutes: 40, tags: ["vegan", "vegetarian", "high-fiber", "meal-prep", "gluten-free"], imageUrl: unsplash("photo-1638329389022-daef2efb71b3") },
  { id: "rec-steak-salad", name: "Grilled Steak & Salad", mealType: "dinner", calories: 520, proteinG: 44, carbsG: 16, fatG: 31, prepTimeMinutes: 25, tags: ["high-protein", "low-carb", "gluten-free"], imageUrl: unsplash("photo-1768260731460-8598a5700e99") },
  { id: "rec-shrimp-pasta", name: "Garlic Shrimp Pasta", mealType: "dinner", calories: 580, proteinG: 36, carbsG: 68, fatG: 18, prepTimeMinutes: 25, tags: ["pescatarian", "high-protein"], imageUrl: unsplash("photo-1764925563135-3d461e72345d") },
  { id: "rec-roast-chicken", name: "Roast Chicken & Vegetables", mealType: "dinner", calories: 540, proteinG: 46, carbsG: 34, fatG: 24, prepTimeMinutes: 50, tags: ["high-protein", "meal-prep", "gluten-free"], imageUrl: unsplash("photo-1778996525694-e87e5eff7a76") },
  { id: "rec-black-bean-tacos", name: "Black Bean Tacos", mealType: "dinner", calories: 460, proteinG: 18, carbsG: 64, fatG: 15, prepTimeMinutes: 20, tags: ["vegan", "vegetarian", "high-fiber"], imageUrl: unsplash("photo-1644085128237-9ba593123ac3") },

  // ---- Snacks ------------------------------------------------------------
  { id: "rec-smoothie", name: "Berry Protein Smoothie", mealType: "snack", calories: 220, proteinG: 20, carbsG: 28, fatG: 4, prepTimeMinutes: 5, tags: ["vegetarian", "high-protein", "quick"], imageUrl: unsplash("photo-1766232584434-caccfb0fcf14") },
  { id: "rec-hummus-veggies", name: "Hummus & Veggie Sticks", mealType: "snack", calories: 190, proteinG: 7, carbsG: 20, fatG: 9, prepTimeMinutes: 5, tags: ["vegan", "vegetarian", "high-fiber", "quick"], imageUrl: unsplash("photo-1644946763226-22c60fcb6635") },
  { id: "rec-chia-pudding", name: "Chia Seed Pudding", mealType: "snack", calories: 260, proteinG: 9, carbsG: 28, fatG: 13, prepTimeMinutes: 10, tags: ["vegetarian", "high-fiber", "omega-3", "meal-prep"], imageUrl: unsplash("photo-1552528352-59648b345866") },
  { id: "rec-trail-mix", name: "Trail Mix", mealType: "snack", calories: 290, proteinG: 9, carbsG: 24, fatG: 19, prepTimeMinutes: 2, tags: ["vegan", "vegetarian", "quick", "gluten-free"], imageUrl: unsplash("photo-1543158181-1274e5362710") },
  { id: "rec-apple-almond-butter", name: "Apple & Almond Butter", mealType: "snack", calories: 240, proteinG: 7, carbsG: 28, fatG: 13, prepTimeMinutes: 3, tags: ["vegan", "vegetarian", "quick", "gluten-free"], imageUrl: unsplash("photo-1642339800118-eb551cfa1434") },
  { id: "rec-boiled-eggs", name: "Boiled Eggs & Fruit", mealType: "snack", calories: 210, proteinG: 14, carbsG: 16, fatG: 10, prepTimeMinutes: 12, tags: ["vegetarian", "high-protein", "gluten-free"], imageUrl: unsplash("photo-1557965983-5b9fc9ab9014") },
  { id: "rec-edamame", name: "Sea Salt Edamame", mealType: "snack", calories: 190, proteinG: 17, carbsG: 15, fatG: 8, prepTimeMinutes: 8, tags: ["vegan", "vegetarian", "high-protein", "high-fiber", "gluten-free"], imageUrl: unsplash("photo-1557621956-ce58555aa0ce") },
  { id: "rec-cheese-crackers", name: "Cheese & Wholegrain Crackers", mealType: "snack", calories: 270, proteinG: 12, carbsG: 24, fatG: 15, prepTimeMinutes: 3, tags: ["vegetarian", "quick"], imageUrl: unsplash("photo-1631505507238-ac1325b817e9") },
];
