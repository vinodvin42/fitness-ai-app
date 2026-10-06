/**
 * Authored ingredient lists and method steps for a handful of seed recipes
 * (Fuel 05, Oct 2026). Deliberately NOT all 80: these are simple, standard
 * dishes whose ingredients and method are unambiguous. Every other recipe has
 * no ingredients/instructions yet and Recipe Detail omits those sections for
 * it rather than showing invented content. Quantities are household-measure
 * indications for one serving, not a nutrition claim - the recipe's macros
 * stay as seeded in recipes.ts.
 */
export interface SeedRecipeDetail {
  ingredients: Array<{ name: string; quantity: string }>;
  instructions: string[];
}

export const seedRecipeDetails: Record<string, SeedRecipeDetail> = {
  "rec-oats": {
    ingredients: [
      { name: "Rolled oats", quantity: "1/2 cup" },
      { name: "Milk or plant milk", quantity: "1/2 cup" },
      { name: "Plain yogurt", quantity: "1/4 cup" },
      { name: "Chia seeds", quantity: "1 tsp" },
      { name: "Berries or sliced fruit", quantity: "1/2 cup" },
    ],
    instructions: [
      "Stir the oats, milk, yogurt and chia seeds together in a jar or bowl.",
      "Cover and refrigerate for at least 4 hours, or overnight.",
      "Top with the fruit and eat cold, or warm it briefly if you prefer.",
    ],
  },
  "rec-chicken-bowl": {
    ingredients: [
      { name: "Chicken breast (skinless)", quantity: "150 g" },
      { name: "Quinoa (cooked)", quantity: "1 cup" },
      { name: "Avocado", quantity: "1/2 medium" },
      { name: "Cherry tomatoes", quantity: "5-6 pcs" },
      { name: "Olive oil", quantity: "1 tsp" },
      { name: "Salt and pepper", quantity: "to taste" },
    ],
    instructions: [
      "Season the chicken breast with salt, pepper and a little of the olive oil.",
      "Grill or pan-sear for 6-8 minutes per side, until cooked through, then rest for 3 minutes and slice.",
      "Build the bowl with the quinoa, sliced chicken, avocado and halved tomatoes, and drizzle with the remaining oil.",
    ],
  },
  "rec-yogurt-parfait": {
    ingredients: [
      { name: "Greek yogurt", quantity: "1 cup" },
      { name: "Berries", quantity: "1/2 cup" },
      { name: "Granola", quantity: "2 tbsp" },
      { name: "Honey", quantity: "1 tsp" },
    ],
    instructions: [
      "Spoon half of the yogurt into a glass or bowl.",
      "Add half of the berries, then the rest of the yogurt.",
      "Top with the remaining berries, the granola and a drizzle of honey.",
    ],
  },
  "rec-eggs-spinach": {
    ingredients: [
      { name: "Eggs", quantity: "3 large" },
      { name: "Fresh spinach", quantity: "2 handfuls" },
      { name: "Olive oil or butter", quantity: "1 tsp" },
      { name: "Salt and pepper", quantity: "to taste" },
    ],
    instructions: [
      "Whisk the eggs with a pinch of salt and pepper.",
      "Wilt the spinach in the oil in a non-stick pan over medium heat, about 1 minute.",
      "Pour in the eggs and stir gently until just set. Serve straight away.",
    ],
  },
  "rec-veggie-omelette": {
    ingredients: [
      { name: "Eggs", quantity: "3 large" },
      { name: "Bell pepper, diced", quantity: "1/4 cup" },
      { name: "Onion or spring onion, chopped", quantity: "2 tbsp" },
      { name: "Spinach or tomato", quantity: "1/4 cup" },
      { name: "Olive oil", quantity: "1 tsp" },
    ],
    instructions: [
      "Soften the vegetables in the oil in a non-stick pan for 2-3 minutes.",
      "Pour the whisked, seasoned eggs over the vegetables.",
      "Cook on medium-low until almost set, fold in half and cook 1 more minute.",
    ],
  },
  "rec-greek-salad": {
    ingredients: [
      { name: "Tomatoes", quantity: "2 medium" },
      { name: "Cucumber", quantity: "1/2" },
      { name: "Red onion", quantity: "1/4" },
      { name: "Feta cheese", quantity: "50 g" },
      { name: "Kalamata olives", quantity: "8-10" },
      { name: "Olive oil", quantity: "1 tbsp" },
      { name: "Dried oregano", quantity: "1/2 tsp" },
    ],
    instructions: [
      "Cut the tomatoes, cucumber and red onion into bite-size pieces and add the olives.",
      "Top with the feta, drizzle with olive oil and sprinkle with oregano.",
    ],
  },
  "rec-caprese": {
    ingredients: [
      { name: "Tomatoes", quantity: "2 medium" },
      { name: "Fresh mozzarella", quantity: "100 g" },
      { name: "Fresh basil leaves", quantity: "a handful" },
      { name: "Olive oil", quantity: "1 tsp" },
      { name: "Salt and pepper", quantity: "to taste" },
    ],
    instructions: [
      "Slice the tomatoes and mozzarella and layer them on a plate, alternating.",
      "Tuck in the basil leaves, drizzle with olive oil and season with salt and pepper.",
    ],
  },
  "rec-avocado-toast": {
    ingredients: [
      { name: "Wholegrain bread", quantity: "2 slices" },
      { name: "Avocado", quantity: "1/2 medium" },
      { name: "Eggs", quantity: "2 large" },
      { name: "Lemon juice", quantity: "1 tsp" },
      { name: "Salt and chilli flakes", quantity: "to taste" },
    ],
    instructions: [
      "Toast the bread.",
      "Mash the avocado with the lemon juice and a pinch of salt and spread it on the toast.",
      "Fry or poach the eggs and place one on each slice. Finish with chilli flakes.",
    ],
  },
};
