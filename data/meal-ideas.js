// Sample combinations built exclusively from the team's imported menu records.
// These are planning ideas; campus ordering options and portions may vary.
(() => {
  const source = window.MEALS;
  const find = (restaurant, category) => source.filter(item => item.location === restaurant && item.category === category);
  const nutrients = ["calories", "proteinGrams", "carbsGrams", "fatGrams", "fiberGrams", "sugarGrams", "saturatedFatGrams", "transFatGrams", "fatCalories", "sodiumMilligrams", "cholesterolMilligrams", "potassiumMilligrams", "calciumMilligrams", "ironMilligrams", "vitaminARe", "vitaminCMilligrams", "vitaminDIu"];
  const createIdea = (name, location, components, kind) => {
    const values = Object.fromEntries(nutrients.map(key => [key, components.every(item => typeof item[key] === "number") ? components.reduce((sum, item) => sum + item[key], 0) : null]));
    const partialNutrition = Object.fromEntries(nutrients.flatMap(key => {
      const known = components.filter(item => typeof item[key] === "number" && Number.isFinite(item[key]));
      return known.length && known.length < components.length ? [[key, known.reduce((sum, item) => sum + item[key], 0)]] : [];
    }));
    const boundedProtein = components.every(item => typeof item.proteinGrams === "number" || item.proteinDisplay === "Less than 1g");
    const uncertainComponents = components.filter(item => item.proteinDisplay === "Less than 1g").length;
    const knownProtein = components.reduce((sum, item) => sum + (typeof item.proteinGrams === "number" ? item.proteinGrams : 0), 0);
    const proteinDisplay = boundedProtein && uncertainComponents ? (knownProtein === 0 && uncertainComponents === 1 ? "Less than 1g" : `At least ${knownProtein}g and less than ${knownProtein + uncertainComponents}g`) : null;
    const labels = Object.fromEntries(["vegetarian", "vegan", "avoidingGluten"].map(key => [key, components.every(item => item[key] === true) ? true : null]));
    return { id: `idea-${kind}-${components.map(item => item.id).join("-")}`, name, location, category: "Meal idea", mealType: "meal", servingSize: "One suggested combination", description: components.map(item => `${item.name} (${item.servingSize || "serving size not specified"})`).join(" + "), components: components.map(item => ({ ...item })), isMealIdea: true, verifiedAt: components.map(item => item.verifiedAt).filter(Boolean).sort()[0], proteinDisplay, partialNutrition, ...values, ...labels };
  };
  const ideas = [];
  const pandaSides = find("Panda Express", "Sides");
  const pandaEntrees = ["Chicken", "Beef", "Seafood", "Vegetables"].flatMap(category => find("Panda Express", category));
  pandaEntrees.forEach(entree => pandaSides.forEach(side => ideas.push(createIdea(`${entree.name} + ${side.name} bowl`, "Panda Express", [entree, side], "panda"))));
  const chickSides = find("Chick-fil-A", "Sides");
  const water = find("Chick-fil-A", "Drinks").find(item => /bottled water/i.test(item.name));
  if (water) find("Chick-fil-A", "Entrees").forEach(entree => chickSides.forEach(side => ideas.push(createIdea(`${entree.name} + ${side.name} meal`, "Chick-fil-A", [entree, side, water], "chick"))));
  const greens = find("Red Radish", "BYO - Base Greens");
  const proteins = find("Red Radish", "BYO - Protein Toppings");
  const toppings = find("Red Radish", "BYO - Base Toppings").filter(item => /cherry tomatoes|sliced cucumber/i.test(item.name));
  greens.forEach(base => proteins.forEach(protein => ideas.push(createIdea(`${protein.name} + ${base.name} salad idea`, "Red Radish", [base, protein, ...toppings], "radish"))));
  window.MEALS.push(...ideas);
})();
