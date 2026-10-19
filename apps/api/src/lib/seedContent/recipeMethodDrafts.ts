/**
 * DRAFT method steps for the 72 seed recipes that have none yet (18 Oct 2026).
 * NOT wired into the seed: recipeDetails.ts deliberately holds only reviewed
 * content, and Recipe Detail omits the method for a recipe without one rather
 * than show something unchecked. These drafts are for review; once a recipe's
 * steps are approved, move it into seedRecipeDetails together with an
 * ingredient list whose quantities are authored to match that recipe's macros
 * in recipes.ts (no quantities are given here, so these steps make no
 * nutrition claim).
 *
 * Written to respect each recipe's tags (vegan: no dairy, egg, honey or fish
 * sauce; gluten-free: tamari or certified gluten-free products named where a
 * gluten source is common) and safe cooking points (poultry and minced meat
 * cooked through, fish opaque, prawns pink). Times are given in the step text
 * so cooking mode can offer a timer; they are typical, not exact.
 */
export interface RecipeMethodDraft {
  instructions: string[];
  /** Anything the reviewer should check or decide. */
  reviewNote?: string;
}

export const recipeMethodDrafts: Record<string, RecipeMethodDraft> = {
  // ---- Breakfast ----
  "rec-protein-pancakes": {
    instructions: [
      "Whisk the oats (blended to a flour), protein powder, baking powder, egg and milk into a thick batter.",
      "Rest the batter for 5 minutes while you heat a non-stick pan over medium heat with a little oil.",
      "Pour small rounds of batter into the pan and cook for about 2 minutes, until bubbles form on top.",
      "Flip and cook for 1 to 2 minutes more, until set in the middle.",
      "Serve with fruit or yogurt.",
    ],
  },
  "rec-breakfast-burrito": {
    instructions: [
      "Whisk the eggs with a pinch of salt and pepper.",
      "Cook the peppers and onion in a little oil over medium heat for 4 minutes, until soft.",
      "Add the eggs and stir gently for 2 to 3 minutes, until just set.",
      "Warm the tortilla for 30 seconds in a dry pan.",
      "Fill with the eggs, beans and a spoon of salsa, then roll up tightly and serve.",
    ],
  },
  "rec-muesli": {
    instructions: [
      "Tip the muesli into a bowl.",
      "Pour over the cold milk.",
      "Let it sit for 2 minutes to soften, then top with fruit if you like.",
    ],
  },
  "rec-cottage-cheese-bowl": {
    instructions: [
      "Spoon the cottage cheese into a bowl.",
      "Wash and slice the fruit.",
      "Top the cottage cheese with the fruit and a sprinkle of seeds or nuts.",
    ],
    reviewNote: "Tagged gluten-free: any added granola must be certified gluten-free.",
  },
  "rec-pb-banana-smoothie": {
    instructions: [
      "Peel and break the banana into a blender.",
      "Add the peanut butter, milk, protein powder (if using) and a few ice cubes.",
      "Blend for 30 to 60 seconds until smooth, then pour and serve.",
    ],
  },
  "rec-shakshuka": {
    instructions: [
      "Cook the onion and pepper in olive oil over medium heat for 5 minutes, until soft.",
      "Stir in the garlic, cumin and paprika for 1 minute.",
      "Add the chopped tomatoes and simmer for 10 minutes, until thickened. Season to taste.",
      "Make small wells in the sauce and crack in the eggs.",
      "Cover and cook on low for 5 to 8 minutes, until the whites are set.",
      "Scatter with herbs and serve.",
    ],
    reviewNote: "Tagged gluten-free: serve on its own or with certified gluten-free bread.",
  },
  "rec-french-toast": {
    instructions: [
      "Whisk the egg, milk and cinnamon in a shallow dish.",
      "Dip each slice of bread for a few seconds on each side.",
      "Cook in a lightly oiled pan over medium heat for 2 to 3 minutes per side, until golden.",
      "Serve topped with the berries.",
    ],
  },
  "rec-bagel-salmon": {
    instructions: [
      "Slice and toast the bagel for 2 to 3 minutes.",
      "Spread both halves with the cream cheese.",
      "Top with the smoked salmon, sliced cucumber or red onion, and a squeeze of lemon.",
      "Season with black pepper and serve.",
    ],
  },
  "rec-smoothie-bowl": {
    instructions: [
      "Blend the frozen acai, frozen banana and a splash of milk for about 1 minute until thick and smooth.",
      "Spoon into a bowl.",
      "Top with sliced fruit, granola and seeds, and eat straight away.",
    ],
  },
  "rec-waffles": {
    instructions: [
      "Heat the waffle iron and brush it lightly with oil.",
      "Whisk the oat flour, protein powder, baking powder, egg and milk into a thick batter.",
      "Pour in enough batter to fill the iron and cook for 3 to 4 minutes, until golden and crisp.",
      "Serve with fruit and a spoon of yogurt.",
    ],
  },
  "rec-porridge": {
    instructions: [
      "Put the oats and milk (or water) in a small pan with a pinch of cinnamon.",
      "Bring to a gentle simmer and cook for 5 minutes, stirring often, until creamy.",
      "Pour into a bowl and top with fruit.",
    ],
  },
  "rec-baked-beans-toast": {
    instructions: [
      "Warm the beans in a small pan over medium heat for 3 to 4 minutes, stirring.",
      "Toast the bread.",
      "Spoon the beans over the toast and season with black pepper.",
    ],
    reviewNote: "Tagged vegan: check the bread contains no milk, butter or egg.",
  },

  // ---- Lunch ----
  "rec-quinoa-salad": {
    instructions: [
      "Rinse the quinoa, then simmer it in water for 15 minutes until tender. Drain and cool.",
      "Drain and rinse the chickpeas.",
      "Chop the cucumber, tomatoes, red onion and parsley.",
      "Whisk the olive oil, lemon juice, salt and pepper.",
      "Toss everything together. It keeps in the fridge for up to 3 days.",
    ],
  },
  "rec-turkey-wrap": {
    instructions: [
      "Spread the hummus over the tortilla.",
      "Layer on the turkey slices, lettuce, tomato and cucumber.",
      "Roll up tightly, cut in half and serve.",
    ],
  },
  "rec-tuna-salad": {
    instructions: [
      "Boil the potatoes for 12 minutes until tender, adding the green beans for the last 3 minutes. Drain and cool.",
      "Boil the egg for 8 minutes, cool it in cold water, then peel and quarter it.",
      "Arrange the lettuce, potatoes, beans, tomatoes, olives and egg on a plate.",
      "Top with the drained tuna.",
      "Dress with olive oil, lemon juice or vinegar, salt and pepper.",
    ],
    reviewNote: "Tagged gluten-free: check any shop-bought dressing.",
  },
  "rec-caesar-salad": {
    instructions: [
      "Season the chicken breast and cook it in a hot pan with a little oil for 6 to 7 minutes per side, until cooked through (75°C / 165°F in the centre).",
      "Rest the chicken for 5 minutes, then slice.",
      "Toss the chopped romaine with the Caesar dressing.",
      "Top with the chicken, shaved Parmesan and croutons.",
    ],
    reviewNote: "Tagged low-carb: consider making croutons optional.",
  },
  "rec-lentil-soup": {
    instructions: [
      "Cook the onion, carrot and celery in olive oil over medium heat for 6 minutes, until soft.",
      "Stir in the garlic and cumin for 1 minute.",
      "Add the rinsed lentils, chopped tomatoes and vegetable stock.",
      "Simmer for 25 minutes, until the lentils are soft.",
      "Season, add a squeeze of lemon, and blend part of it if you like it thicker.",
    ],
  },
  "rec-falafel-bowl": {
    instructions: [
      "Bake the falafel at 200°C (400°F) for 15 minutes, turning once, until crisp.",
      "Warm or cook the grain base (rice, quinoa or bulgur).",
      "Chop the cucumber, tomatoes and red onion.",
      "Thin the tahini with lemon juice and water into a pourable dressing.",
      "Build the bowl with the grains, salad and falafel, and drizzle with the tahini.",
    ],
  },
  "rec-poke-bowl": {
    instructions: [
      "Cook the sushi rice according to the pack and let it cool slightly.",
      "Cut the sushi-grade salmon into small cubes and toss with soy sauce and sesame oil.",
      "Slice the avocado, cucumber and radish.",
      "Top the rice with the salmon and vegetables, then sprinkle with sesame seeds and spring onion.",
    ],
    reviewNote: "Raw fish: use sushi-grade fish kept chilled; not suitable in pregnancy or for anyone advised to avoid raw fish.",
  },
  "rec-egg-salad-sandwich": {
    instructions: [
      "Boil the eggs for 10 minutes, then cool them in cold water and peel.",
      "Chop the eggs and mix with the mayonnaise or yogurt, mustard, salt and pepper.",
      "Spread onto the bread with some lettuce, then close the sandwich and cut in half.",
    ],
  },
  "rec-shrimp-rice-bowl": {
    instructions: [
      "Cook the rice according to the pack.",
      "Cook the prawns in a hot pan with a little oil and garlic for 2 to 3 minutes, until pink and opaque.",
      "Add a splash of tamari and lime juice to the pan.",
      "Serve the prawns over the rice with sliced vegetables and spring onion.",
    ],
    reviewNote: "Tagged gluten-free: tamari, not regular soy sauce.",
  },
  "rec-mezze-plate": {
    instructions: [
      "Warm the pita in a dry pan for 1 minute per side, then cut into triangles.",
      "Spoon the hummus and any dips into small bowls.",
      "Arrange the cucumber, tomatoes, olives, feta and falafel or beans around them.",
      "Drizzle with olive oil and serve.",
    ],
  },
  "rec-chicken-pesto-pasta": {
    instructions: [
      "Cook the pasta in salted boiling water according to the pack, usually 10 to 12 minutes.",
      "Meanwhile, cook the sliced chicken in a pan with a little oil for 6 to 8 minutes, until cooked through.",
      "Drain the pasta, keeping a little of the cooking water.",
      "Toss the pasta, chicken and pesto together, loosening with a splash of the water.",
      "Add the spinach or tomatoes and serve. Keeps in the fridge for 3 days.",
    ],
  },
  "rec-sushi-bowl": {
    instructions: [
      "Cook the sushi rice and season it with rice vinegar while warm.",
      "Cut the sushi-grade salmon into slices or cubes.",
      "Slice the avocado and cucumber, and shred the nori.",
      "Top the rice with the salmon and vegetables, and serve with soy sauce and pickled ginger.",
    ],
    reviewNote: "Raw fish: as for the poke bowl. Could also use cooked salmon.",
  },
  "rec-buddha-bowl": {
    instructions: [
      "Roast the cubed sweet potato and chickpeas at 200°C (400°F) for 25 minutes.",
      "Cook the quinoa or brown rice.",
      "Chop the greens, red cabbage and avocado.",
      "Whisk a tahini and lemon dressing.",
      "Arrange everything in a bowl and drizzle with the dressing.",
    ],
    reviewNote: "Prep time is 20 min but roasting takes 25 - consider updating prep time or using pre-roasted veg.",
  },
  "rec-club-sandwich": {
    instructions: [
      "Toast three slices of bread.",
      "Spread a little mayonnaise on one side of each slice.",
      "Layer turkey, lettuce and tomato on the first slice, top with the second, then add the bacon and more turkey.",
      "Close with the third slice, secure with cocktail sticks and cut into quarters.",
    ],
  },
  "rec-pho": {
    instructions: [
      "Simmer the stock with sliced ginger, star anise, cinnamon and a dash of fish sauce for 15 minutes.",
      "Add the thinly sliced chicken breast and poach for 6 to 8 minutes, until cooked through.",
      "Soak or cook the rice noodles according to the pack and drain.",
      "Put the noodles in a bowl and ladle over the broth and chicken.",
      "Top with bean sprouts, herbs, lime and chilli.",
    ],
  },
  "rec-banh-mi": {
    instructions: [
      "Quick-pickle the carrot and daikon in rice vinegar with a pinch of sugar for 10 minutes.",
      "Cook the marinated sliced pork or chicken in a hot pan for 6 to 8 minutes, until cooked through.",
      "Split and lightly toast the baguette.",
      "Spread with mayonnaise, then fill with the meat, pickles, cucumber, coriander and chilli.",
    ],
    reviewNote: "The recipe doesn't say which meat; choose one and match the macros.",
  },
  "rec-minestrone": {
    instructions: [
      "Cook the onion, carrot and celery in olive oil for 6 minutes.",
      "Add the garlic, courgette and beans, and cook for 2 minutes.",
      "Pour in the chopped tomatoes and vegetable stock and simmer for 15 minutes.",
      "Add the small pasta and simmer for 8 to 10 minutes more, until tender.",
      "Stir in the greens, season and serve.",
    ],
    reviewNote: "Tagged vegan: no Parmesan rind or cheese topping (or use a vegan alternative).",
  },
  "rec-ramen": {
    instructions: [
      "Heat the stock and whisk in the miso paste - don't let it boil hard after adding miso.",
      "Boil the egg for 7 minutes, cool it in cold water and peel.",
      "Cook the ramen noodles according to the pack and drain.",
      "Warm the sliced chicken or pork in the broth.",
      "Put the noodles in a bowl, ladle over the broth, and top with the halved egg, spring onion, corn and nori.",
    ],
  },
  "rec-soba": {
    instructions: [
      "Cook the soba noodles for 4 to 5 minutes, then rinse under cold water and drain well.",
      "Whisk the soy sauce, rice vinegar, sesame oil and a little maple syrup.",
      "Toss the noodles with the dressing, edamame, cucumber and spring onion.",
      "Sprinkle with sesame seeds and serve cold.",
    ],
    reviewNote: "Tagged vegan: maple syrup, not honey. Soba is often part wheat - not gluten-free unless 100% buckwheat.",
  },
  "rec-tomato-soup": {
    instructions: [
      "Roast the halved tomatoes, onion and garlic with olive oil at 200°C (400°F) for 25 minutes.",
      "Tip everything into a pan with the vegetable stock and simmer for 5 minutes.",
      "Blend until smooth and season with salt, pepper and basil.",
    ],
    reviewNote: "Tagged vegan and gluten-free: no cream; use a gluten-free stock.",
  },

  // ---- Dinner ----
  "rec-salmon": {
    instructions: [
      "Heat the oven to 200°C (400°F).",
      "Season the salmon with lemon, salt and pepper and bake for 12 to 15 minutes, until it flakes easily.",
      "Meanwhile, steam or sauté the greens for 4 minutes.",
      "Serve the salmon on the greens with a wedge of lemon.",
    ],
  },
  "rec-tofu-stirfry": {
    instructions: [
      "Press the tofu dry and cut it into cubes.",
      "Fry the tofu in a hot pan with a little oil for 6 to 8 minutes, until golden. Set aside.",
      "Stir-fry the vegetables for 4 minutes, until just tender.",
      "Add the garlic, ginger and soy sauce, then return the tofu and toss for 1 minute.",
      "Serve with rice or noodles.",
    ],
    reviewNote: "Tagged vegan: no oyster sauce or honey.",
  },
  "rec-beef-sweet-potato": {
    instructions: [
      "Bake the cubed sweet potato at 200°C (400°F) for 25 minutes, until tender.",
      "Season the lean beef steak and cook it in a hot pan for 3 to 4 minutes per side, to your liking.",
      "Rest the beef for 5 minutes, then slice.",
      "Serve with the sweet potato and a side of greens.",
    ],
  },
  "rec-chicken-curry": {
    instructions: [
      "Cook the onion in oil over medium heat for 6 minutes, until golden.",
      "Add the garlic, ginger and curry spices and cook for 1 minute.",
      "Add the diced chicken and cook for 5 minutes, turning, until sealed.",
      "Pour in the chopped tomatoes and a splash of water and simmer for 20 minutes, until the chicken is cooked through.",
      "Meanwhile, cook the rice. Serve the curry over the rice.",
    ],
    reviewNote: "Tagged gluten-free: check the curry paste or powder.",
  },
  "rec-turkey-meatballs": {
    instructions: [
      "Mix the turkey mince with the egg, garlic, herbs, salt and pepper, and roll into small balls.",
      "Brown the meatballs in a little oil for 5 minutes.",
      "Add the tomato sauce and simmer for 15 minutes, until cooked through (no pink in the centre).",
      "Sauté the courgette noodles for 2 minutes, just until warm.",
      "Serve the meatballs and sauce over the courgette noodles.",
    ],
    reviewNote: "Tagged gluten-free and low-carb: no breadcrumbs.",
  },
  "rec-baked-cod": {
    instructions: [
      "Heat the oven to 200°C (400°F).",
      "Toss the sliced potatoes with olive oil and salt and roast for 20 minutes.",
      "Add the seasoned cod to the tray and bake for 12 to 15 minutes more, until the fish is opaque and flakes easily.",
      "Serve with a green vegetable and lemon.",
    ],
  },
  "rec-beef-stirfry": {
    instructions: [
      "Slice the beef thinly and toss with a little soy sauce and cornflour.",
      "Stir-fry the beef in a very hot pan for 2 to 3 minutes. Set aside.",
      "Stir-fry the broccoli with a splash of water for 3 minutes.",
      "Add the garlic, ginger and sauce, return the beef and toss for 1 minute.",
      "Serve with rice.",
    ],
  },
  "rec-veggie-chili": {
    instructions: [
      "Cook the onion and peppers in oil for 6 minutes.",
      "Add the garlic, chilli, cumin and paprika and cook for 1 minute.",
      "Add the beans, chopped tomatoes and stock.",
      "Simmer for 25 minutes, until thick. Season to taste.",
      "Serve with rice or on its own. Keeps for 3 days in the fridge.",
    ],
    reviewNote: "Tagged gluten-free: check the stock.",
  },
  "rec-steak-salad": {
    instructions: [
      "Season the steak and cook it in a hot pan for 3 to 4 minutes per side, to your liking.",
      "Rest it for 5 minutes, then slice thinly.",
      "Toss the salad leaves, tomatoes, cucumber and red onion with olive oil and vinegar.",
      "Top with the steak and serve.",
    ],
  },
  "rec-shrimp-pasta": {
    instructions: [
      "Cook the pasta in salted boiling water according to the pack, usually 10 to 12 minutes.",
      "Meanwhile, cook the garlic and chilli in olive oil for 1 minute.",
      "Add the prawns and cook for 2 to 3 minutes, until pink and opaque.",
      "Toss in the drained pasta with a splash of cooking water, lemon and parsley.",
    ],
  },
  "rec-roast-chicken": {
    instructions: [
      "Heat the oven to 200°C (400°F).",
      "Toss the chopped vegetables with olive oil, salt and herbs in a roasting tin.",
      "Add the seasoned chicken pieces on top.",
      "Roast for 40 to 45 minutes, until the chicken is cooked through (75°C / 165°F, juices run clear).",
      "Rest for 5 minutes and serve. Keeps for 3 days in the fridge.",
    ],
  },
  "rec-black-bean-tacos": {
    instructions: [
      "Warm the black beans with cumin, paprika and a splash of water for 5 minutes, mashing a few.",
      "Warm the corn tortillas in a dry pan for 30 seconds per side.",
      "Mash the avocado with lime and salt.",
      "Fill the tortillas with the beans, avocado, salsa, shredded cabbage and coriander.",
    ],
    reviewNote: "Tagged vegan: no cheese or sour cream.",
  },
  "rec-butter-chicken": {
    instructions: [
      "Marinate the diced chicken in yogurt and spices for at least 10 minutes.",
      "Cook the chicken in a hot pan for 6 minutes, turning, until browned.",
      "Add the garlic, ginger, tomato purée and spices and cook for 1 minute.",
      "Stir in the tomatoes and cream and simmer for 15 minutes, until the chicken is cooked through.",
      "Warm the naan and serve with the curry.",
    ],
  },
  "rec-lasagna": {
    instructions: [
      "Brown the lean beef mince with the onion and garlic for 8 minutes.",
      "Add the chopped tomatoes and herbs and simmer for 15 minutes.",
      "Layer the sauce, lasagne sheets and white sauce in a dish, finishing with sauce and cheese.",
      "Bake at 180°C (350°F) for 35 minutes, until bubbling and golden.",
      "Rest for 10 minutes before cutting. Keeps for 3 days in the fridge.",
    ],
    reviewNote: "Total time is about 70 min; the recipe says 60.",
  },
  "rec-fish-tacos": {
    instructions: [
      "Season the white fish with lime, paprika and salt.",
      "Cook it in a hot pan with a little oil for 3 to 4 minutes per side, until opaque and flaky.",
      "Mix the shredded cabbage with lime juice and a spoon of yogurt.",
      "Warm the tortillas, then fill with the fish, slaw and salsa.",
    ],
  },
  "rec-paella": {
    instructions: [
      "Cook the onion, pepper and garlic in olive oil for 5 minutes.",
      "Stir in the rice, paprika and saffron for 1 minute.",
      "Add the hot stock and simmer without stirring for 15 minutes.",
      "Nestle in the prawns and mussels, cover and cook for 8 to 10 minutes, until the prawns are pink and the mussels open.",
      "Discard any mussels that stay closed. Rest for 5 minutes and serve with lemon.",
    ],
    reviewNote: "Tagged gluten-free: check the stock.",
  },
  "rec-risotto": {
    instructions: [
      "Cook the onion in olive oil for 4 minutes, then add the mushrooms and cook for 5 minutes.",
      "Stir in the risotto rice for 1 minute.",
      "Add the hot stock a ladle at a time, stirring, for 18 to 20 minutes, until the rice is creamy but has a little bite.",
      "Stir in the Parmesan, season and serve.",
    ],
    reviewNote: "Tagged gluten-free: check the stock. Traditional Parmesan uses animal rennet - for strict vegetarians use a vegetarian hard cheese.",
  },
  "rec-stuffed-peppers": {
    instructions: [
      "Heat the oven to 190°C (375°F). Halve the peppers and remove the seeds.",
      "Brown the lean mince with the onion and garlic for 8 minutes.",
      "Stir in the cooked rice, tomatoes and spices.",
      "Fill the peppers, top with a little cheese and bake for 25 minutes, until the peppers are tender.",
    ],
  },
  "rec-pizza": {
    instructions: [
      "Heat the oven as hot as it goes, about 240°C (465°F).",
      "Roll out the wholemeal dough into a thin round on a floured tray.",
      "Spread with the tomato sauce and tear over the mozzarella.",
      "Bake for 10 to 12 minutes, until the base is crisp and the cheese bubbles.",
      "Scatter with fresh basil and serve.",
    ],
  },
  "rec-satay": {
    instructions: [
      "Marinate the chicken strips in tamari, garlic and a little oil for 10 minutes.",
      "Thread onto skewers (soak wooden skewers first).",
      "Grill or griddle for 4 to 5 minutes per side, until cooked through.",
      "Warm the peanut butter with tamari, lime and water into a sauce.",
      "Serve the skewers with the sauce and cucumber.",
    ],
    reviewNote: "Tagged gluten-free: tamari, not regular soy sauce.",
  },
  "rec-gnocchi": {
    instructions: [
      "Simmer the tomato sauce with garlic and basil for 5 minutes.",
      "Cook the gnocchi in boiling water for 2 to 3 minutes, until they float. Drain.",
      "Toss the gnocchi in the sauce and top with the cheese.",
    ],
  },
  "rec-burger": {
    instructions: [
      "Shape the lean beef mince into a patty and season.",
      "Cook in a hot pan for 4 to 5 minutes per side, until cooked through (71°C / 160°F, no pink in the middle).",
      "Toast the bun.",
      "Build the burger with lettuce, tomato, onion and your sauce.",
    ],
  },
  "rec-katsu": {
    instructions: [
      "Coat the flattened chicken breast in flour, beaten egg, then panko.",
      "Bake at 200°C (400°F) for 20 minutes, or shallow-fry for 4 to 5 minutes per side, until cooked through.",
      "Simmer the katsu curry sauce for 10 minutes.",
      "Cook the rice.",
      "Slice the chicken and serve over rice with the sauce.",
    ],
  },
  "rec-dumplings": {
    instructions: [
      "Line a steamer basket with baking paper.",
      "Steam the dumplings over boiling water for 8 to 10 minutes, until cooked through.",
      "Mix the soy sauce, rice vinegar and chilli for dipping.",
      "Serve with steamed greens and the dipping sauce.",
    ],
    reviewNote: "Recipe doesn't say homemade or shop-bought, or the filling; match to the macros.",
  },

  // ---- Snacks ----
  "rec-smoothie": {
    instructions: [
      "Put the berries, protein powder, milk or yogurt and a few ice cubes in a blender.",
      "Blend for 30 to 60 seconds until smooth, then serve.",
    ],
  },
  "rec-hummus-veggies": {
    instructions: [
      "Wash and cut the carrot, cucumber and pepper into sticks.",
      "Spoon the hummus into a small bowl and serve with the sticks.",
    ],
  },
  "rec-chia-pudding": {
    instructions: [
      "Stir the chia seeds into the milk with a little vanilla.",
      "Stir again after 5 minutes so it doesn't clump.",
      "Cover and chill for at least 2 hours, or overnight.",
      "Top with fruit before eating.",
    ],
    reviewNote: "Prep time says 10 min - mention it needs at least 2 hours to set.",
  },
  "rec-trail-mix": {
    instructions: [
      "Mix the nuts, seeds and dried fruit in a small bowl or tub.",
      "Portion it out so it stays a snack-sized serving.",
    ],
    reviewNote: "Tagged vegan and gluten-free: no honey-coated nuts or milk chocolate pieces.",
  },
  "rec-apple-almond-butter": {
    instructions: [
      "Core the apple and cut it into slices.",
      "Serve with the almond butter for dipping.",
    ],
  },
  "rec-boiled-eggs": {
    instructions: [
      "Lower the eggs into boiling water and boil for 9 minutes.",
      "Cool them in cold water, then peel.",
      "Serve with the fruit and a pinch of salt and pepper.",
    ],
  },
  "rec-edamame": {
    instructions: [
      "Cook the frozen edamame in boiling water for 4 to 5 minutes.",
      "Drain and sprinkle with sea salt.",
    ],
  },
  "rec-cheese-crackers": {
    instructions: [
      "Slice the cheese.",
      "Serve with the wholegrain crackers and a few grapes or cucumber slices if you like.",
    ],
  },
  "rec-popcorn": {
    instructions: [
      "Heat the kernels in a hot-air popper, or in a covered pan with a little oil over medium heat.",
      "Shake the pan until the popping slows to a few seconds apart, about 3 minutes.",
      "Season with a pinch of salt.",
    ],
    reviewNote: "Tagged vegan: oil, not butter.",
  },
  "rec-dark-chocolate": {
    instructions: [
      "Portion out the dark chocolate and almonds into a small bowl.",
    ],
    reviewNote: "Tagged gluten-free: check the chocolate label.",
  },
  "rec-fruit-salad": {
    instructions: [
      "Wash, peel and chop the fruit into bite-sized pieces.",
      "Toss with a squeeze of lime or orange juice and serve.",
    ],
    reviewNote: "Tagged vegan: no honey.",
  },
  "rec-protein-shake": {
    instructions: [
      "Add the milk and chocolate protein powder to a shaker or blender.",
      "Shake or blend for 30 seconds until smooth, then serve.",
    ],
  },
  "rec-tzatziki": {
    instructions: [
      "Grate the cucumber and squeeze out the water.",
      "Mix with the Greek yogurt, garlic, lemon, mint, salt and pepper.",
      "Warm the pita for 1 minute and cut into strips to serve with the tzatziki.",
    ],
  },
  "rec-olives-cheese": {
    instructions: [
      "Cube the feta.",
      "Serve with the olives, drizzled with a little olive oil and dried oregano.",
    ],
  },
  "rec-granola-bar": {
    instructions: [
      "Unwrap the bar and serve.",
    ],
    reviewNote: "Unclear whether this is shop-bought or homemade. If homemade, it needs a proper bake method and a longer prep time.",
  },
  "rec-guacamole": {
    instructions: [
      "Mash the avocado with lime juice and salt.",
      "Stir in the finely chopped tomato, onion and coriander.",
      "Serve with the tortilla chips.",
    ],
    reviewNote: "Tagged gluten-free: use corn chips labelled gluten-free.",
  },
};
