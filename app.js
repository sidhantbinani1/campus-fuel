const $ = (selector) => document.querySelector(selector);
const mealGrid = $("#meal-grid");
const emptyState = $("#empty-state");
const storedGoals = JSON.parse(localStorage.getItem("campusfuel-goals") || "{}");
const storedLog = JSON.parse(localStorage.getItem("campusfuel-meal-history") || localStorage.getItem("campusfuel-today-log") || "[]");
const storedDailyGoals = JSON.parse(localStorage.getItem("campusfuel-daily-goals") || "{}");
const dateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const normalizedEntries = Array.isArray(storedLog) ? storedLog.map((entry, index) => {
  const normalized = typeof entry === "string" ? { id: entry, date: dateKey() } : entry;
  return normalized && normalized.id && normalized.date ? { ...normalized, entryId: normalized.entryId || `${normalized.id}-${normalized.date}-${index}` } : null;
}).filter(Boolean) : [];
const OPTIONAL_NUTRIENTS = [
  ["carbsGrams", "Carbs", "g"], ["fatGrams", "Fat", "g"], ["fiberGrams", "Fiber", "g"], ["sugarGrams", "Sugar", "g"],
  ["saturatedFatGrams", "Saturated fat", "g"], ["transFatGrams", "Trans fat", "g"], ["fatCalories", "Calories from fat", "cal"],
  ["sodiumMilligrams", "Sodium", "mg"], ["cholesterolMilligrams", "Cholesterol", "mg"], ["potassiumMilligrams", "Potassium", "mg"],
  ["calciumMilligrams", "Calcium", "mg"], ["ironMilligrams", "Iron", "mg"], ["vitaminARe", "Vitamin A", "RE"], ["vitaminCMilligrams", "Vitamin C", "mg"], ["vitaminDIu", "Vitamin D", "IU"]
].map(([key, label, unit]) => ({ key, label, unit }));
const storedOptionalGoals = storedGoals.optionalGoals || {};
const state = {
  query: "", maxCalories: "", minProtein: "", diet: "", location: "", mealType: "", restaurantTab: "", suggestionMode: false, selected: [],
  goals: { calories: storedGoals.calories || "", protein: storedGoals.protein || "", vegetarian: Boolean(storedGoals.vegetarian), vegan: Boolean(storedGoals.vegan), avoidingGluten: Boolean(storedGoals.avoidingGluten), optionalGoals: storedOptionalGoals },
  entries: normalizedEntries, dailyGoals: storedDailyGoals,
  view: "dashboard", planMessage: ""
};
let planDraft = { ...state.goals, optionalGoals: { ...state.goals.optionalGoals } };
let planCategory = "Macros";
const GOAL_CATEGORIES = { Macros: ["carbsGrams", "fatGrams", "fiberGrams", "sugarGrams", "saturatedFatGrams", "transFatGrams", "fatCalories"], Minerals: ["sodiumMilligrams", "cholesterolMilligrams", "potassiumMilligrams", "calciumMilligrams", "ironMilligrams"], Vitamins: ["vitaminARe", "vitaminCMilligrams", "vitaminDIu"] };

let logConfirmationTimer;

function confirmMealLogged(mealId) {
  const meal = window.MEALS.find(item => item.id === mealId);
  const confirmation = $("#log-confirmation");
  confirmation.textContent = `✓ ${meal?.name || "Meal"} logged to today's meal log`;
  confirmation.hidden = false;
  document.querySelectorAll(".log-button").forEach(button => {
    if (button.dataset.logId === mealId) button.textContent = "✓ Meal logged";
  });
  clearTimeout(logConfirmationTimer);
  logConfirmationTimer = setTimeout(() => {
    confirmation.hidden = true;
    document.querySelectorAll(".log-button").forEach(button => { button.textContent = "Log meal +"; });
  }, 3500);
}

const number = (value) => Number(value) || 0;
const text = (value, fallback = "Unavailable") => value === null || value === undefined || value === "" ? fallback : value;
const nutritionText = (meal, key, unit, fallback = "Unavailable") => {
  if (typeof meal[key] === "number") return `${meal[key]}${unit}`;
  if (key === "proteinGrams" && meal.proteinDisplay) return meal.proteinDisplay;
  if (typeof meal.partialNutrition?.[key] === "number") return `${Number(meal.partialNutrition[key].toFixed(2))}${unit} known*`;
  return fallback;
};
const proteinText = (meal, fallback = "Unavailable") => nutritionText(meal, "proteinGrams", "g", fallback);
const CORE_NUTRIENTS = [{ key: "calories", label: "calories" }, { key: "proteinGrams", label: "protein" }, { key: "carbsGrams", label: "carbs" }, { key: "fatGrams", label: "fat" }];
function missingIngredientNotes(meal, nutrients = CORE_NUTRIENTS) {
  if (!meal.components) return [];
  const partialKeys = nutrients.filter(({ key }) => meal[key] == null && typeof meal.partialNutrition?.[key] === "number" && !(key === "proteinGrams" && meal.proteinDisplay));
  return meal.components.flatMap(item => {
    const missing = partialKeys.filter(({ key }) => typeof item[key] !== "number" && !(key === "proteinGrams" && item.proteinDisplay)).map(({ label }) => label.toLowerCase());
    return missing.length ? [`${item.name} is missing ${missing.join(", ")}.`] : [];
  });
}
const badge = (label, kind = "neutral") => `<span class="badge ${kind}">${label}</span>`;

const mealsForEntries = (entries) => entries.map(entry => window.MEALS.find(meal => meal.id === entry.id)).filter(Boolean);
const todaysEntries = () => state.entries.filter(entry => entry.date === dateKey());
const loggedMeals = () => mealsForEntries(todaysEntries());
const knownNutrient = (meal, key) => typeof meal[key] === "number" && Number.isFinite(meal[key]) ? meal[key] : typeof meal.partialNutrition?.[key] === "number" ? meal.partialNutrition[key] : 0;
const incompleteNutrient = (entries, key) => { const meals = mealsForEntries(entries); return meals.length !== entries.length || meals.some(meal => typeof meal[key] !== "number" || !Number.isFinite(meal[key])); };
const totals = (entries = todaysEntries()) => mealsForEntries(entries).reduce((total, meal) => ({ calories: total.calories + knownNutrient(meal, "calories"), protein: total.protein + knownNutrient(meal, "proteinGrams") }), { calories: 0, protein: 0 });
const nutrientTotals = (entries = todaysEntries()) => mealsForEntries(entries).reduce((total, meal) => { OPTIONAL_NUTRIENTS.forEach(({ key }) => { total[key] += knownNutrient(meal, key); }); return total; }, Object.fromEntries(OPTIONAL_NUTRIENTS.map(({ key }) => [key, 0])));
const remaining = () => { const used = totals(); return { calories: state.goals.calories === "" ? null : number(state.goals.calories) - used.calories, protein: state.goals.protein === "" ? null : number(state.goals.protein) - used.protein }; };

function saveTodaysGoals() {
  state.dailyGoals[dateKey()] = { calories: state.goals.calories, protein: state.goals.protein, optionalGoals: { ...state.goals.optionalGoals } };
  localStorage.setItem("campusfuel-daily-goals", JSON.stringify(state.dailyGoals));
}

function interpretQuery(query) {
  const queryText = query.toLowerCase();
  const calories = queryText.match(/(?:under|below|less than|up to|max(?:imum)?)[^0-9]{0,12}(\d{2,4})\s*(?:cal|calorie)?/);
  const protein = queryText.match(/(?:at least|min(?:imum)?|more than)[^0-9]{0,12}(\d{1,3})\s*(?:g|grams?)\s*(?:of\s*)?protein/);
  if (calories) state.maxCalories = calories[1];
  if (protein) state.minProtein = protein[1];
  if (queryText.includes("vegetarian")) state.diet = "vegetarian";
  if (queryText.includes("vegan")) state.diet = "vegan";
}

function filteredMeals(applyPreferences = true) {
  const wantsMeal = /\b(meals?|combos?|bowls?|salads?|wraps?)\b/i.test(state.query);
  const ignored = ["under", "below", "above", "over", "less", "than", "least", "more", "maximum", "minimum", "calories", "calorie", "vegetarian", "protein", "vegan", "grams", "need", "want", "with", "have", "find", "give", "show", "high", "low", "meal", "meals", "combo", "combos", "bowl", "bowls", "salad", "salads", "wrap", "wraps"];
  const words = state.query.toLowerCase().match(/[a-z]+/g)?.filter(word => word.length > 3 && !ignored.includes(word)) || [];
  return window.MEALS.filter(meal => {
    const completeSalad = meal.location === "Red Radish" && meal.category === "Salad" && /salad/i.test(meal.name) && /bowl|plate|serving/i.test(meal.servingSize || "");
    if ((wantsMeal || state.mealType === "meal") && !meal.isMealIdea && !completeSalad) return false;
    if (state.location && meal.location !== state.location) return false;
    if (state.mealType === "snack" && meal.mealType !== "snack") return false;
    if (state.maxCalories && (meal.calories === null || meal.calories > number(state.maxCalories))) return false;
    if (state.minProtein && (meal.proteinGrams === null || meal.proteinGrams < number(state.minProtein))) return false;
    if (state.diet && meal[state.diet] !== true) return false;
    if (applyPreferences && state.goals.vegetarian && meal.vegetarian !== true) return false;
    if (applyPreferences && state.goals.vegan && meal.vegan !== true) return false;
    if (applyPreferences && state.goals.avoidingGluten && meal.avoidingGluten !== true) return false;
    return !words.length || words.some(word => `${meal.name} ${meal.location} ${meal.description || ""}`.toLowerCase().includes(word));
  });
}

function mealReason(meal) {
  const left = remaining(); const reasons = [];
  if (state.maxCalories && meal.calories <= number(state.maxCalories)) reasons.push(`${meal.calories} calories, within your limit`);
  else if (left.calories !== null && !incompleteNutrient(todaysEntries(), "calories") && meal.calories !== null && meal.calories <= left.calories) reasons.push(`${meal.calories} calories, within today's remaining target`);
  if (state.minProtein && meal.proteinGrams >= number(state.minProtein)) reasons.push(`${meal.proteinGrams}g protein, meeting your goal`);
  if (state.diet && meal[state.diet] === true) reasons.push(`verified ${state.diet}`);
  if (state.goals.avoidingGluten && meal.avoidingGluten === true) reasons.push("verified avoiding-gluten label");
  return reasons.length ? reasons.join(" · ") : meal.isMealIdea ? "Suggested combination from imported menu items" : "Meal record in the current dataset";
}

function mealCard(meal) {
  const chosen = state.selected.includes(meal.id);
  const missingNotes = missingIngredientNotes(meal);
  const labels = [meal.isMealIdea ? badge("Suggested combination") : "", meal.vegetarian === true ? badge("Vegetarian", "green") : "", meal.vegan === true ? badge("Vegan", "green") : ""].join("");
  return `<article class="meal-card" data-meal-id="${meal.id}" tabindex="0" role="button" aria-label="View nutrition facts for ${meal.name}"><div class="card-top"><span class="location">${meal.location}</span></div><h3>${meal.name}</h3><p class="serving">${text(meal.servingSize, "Serving size unavailable")}</p><div class="stats"><div><strong>${nutritionText(meal, "calories", "", "—")}</strong><span>calories</span></div><div><strong>${proteinText(meal, "—")}</strong><span>protein</span></div><div><strong>${nutritionText(meal, "carbsGrams", "g", "—")}</strong><span>carbs</span></div><div><strong>${nutritionText(meal, "fatGrams", "g", "—")}</strong><span>fat</span></div></div>${missingNotes.length ? `<p class="partial-note">* Known subtotal. ${missingNotes.join(" ")} Known amounts are included in daily totals; missing amounts are unknown.</p>` : ""}<div class="badges">${labels || badge("More labels pending verification")}</div><p class="match-reason">${mealReason(meal)}</p><div class="card-actions"><button class="compare-button ${chosen ? "selected" : ""}" data-meal-id="${meal.id}" type="button" ${!chosen && state.selected.length >= 2 ? "disabled" : ""}>${chosen ? "Selected to compare ✓" : "Compare meal"}</button><button class="log-button" data-log-id="${meal.id}" type="button">Log meal +</button></div></article>`;
}

function scoreMeal(meal) {
  const left = remaining(); let score = 0;
  if (left.protein !== null && meal.proteinGrams !== null) score -= Math.min(meal.proteinGrams, Math.max(left.protein, 0)) * 5;
  if (left.calories !== null && meal.calories !== null) score += meal.calories > left.calories ? 1000 + meal.calories : meal.calories / 100;
  return score;
}

function renderBestMatch(meals) {
  const target = $("#best-match");
  if (!meals.length) { target.innerHTML = ""; target.hidden = true; return; }
  const meal = meals[0];
  const title = state.suggestionMode ? "Idea based on what you have left today" : [state.maxCalories, state.minProtein, state.diet, state.location, state.mealType].some(Boolean) ? "Best match for your request" : state.goals.protein || state.goals.calories ? "Best fit for today's plan" : "Start with this verified choice";
  target.hidden = false;
  const comparisonFull = state.selected.length >= 2 && !state.selected.includes(meal.id);
  const compareLabel = comparisonFull ? "View comparison (2 selected) →" : "Compare options →";
  target.innerHTML = `<div class="best-mark">✦ <span>TOP PICK</span></div><div class="best-copy"><p class="eyebrow">${title}</p><h3><button class="best-detail" type="button">${meal.name}</button></h3><p>${meal.location} · ${mealReason(meal)}</p></div><div class="best-stats"><strong>${text(meal.calories)}</strong><span>${meal.calories === null ? "Calories unavailable" : "calories"}</span></div><button class="best-compare" type="button">${compareLabel}</button>`;
  target.onclick = event => { if (!event.target.closest(".best-compare")) showMealDetails(meal); };
  $(".best-compare").addEventListener("click", () => {
    if (state.selected.length === 2) openComparison();
    else if (!state.selected.includes(meal.id)) toggleCompare(meal.id);
  });
}

function renderGoalSummary() {
  const selected = OPTIONAL_NUTRIENTS.filter(({ key }) => Object.hasOwn(planDraft.optionalGoals, key));
  $("#optional-goal-count").textContent = `${selected.length} selected`;
  $("#plan-goal-count").textContent = `${selected.length + Number(planDraft.calories !== "") + Number(planDraft.protein !== "")} daily goals`;
  $("#optional-goal-summary").innerHTML = selected.map(({ key, label, unit }) => `<span>${label} <b>${text(planDraft.optionalGoals[key], "—")}${unit}</b></span>`).join("") || '<span class="goal-summary-empty">No extra targets yet</span>';
}

function renderOptionalProgress() {
  const used = nutrientTotals();
  const tracked = OPTIONAL_NUTRIENTS.filter(({ key }) => state.goals.optionalGoals[key] !== undefined && state.goals.optionalGoals[key] !== "");
  $("#optional-progress").innerHTML = tracked.map(({ key, label, unit }) => { const incomplete = incompleteNutrient(todaysEntries(), key); return `<div class="optional-progress-card"><span>${label} remaining</span><strong>${incomplete ? "Up to " : ""}${Math.max(0, number(state.goals.optionalGoals[key]) - used[key])}${unit}</strong><small>${incomplete ? "At least " : ""}${used[key]} of ${state.goals.optionalGoals[key]}${unit} logged${incomplete ? " (some values missing)" : ""}</small></div>`; }).join("");
}

function renderOptionalGoals() {
  $("#goal-category-title").textContent = planCategory;
  document.querySelectorAll(".goal-category").forEach(button => { const selected = button.dataset.category === planCategory; button.classList.toggle("active", selected); button.setAttribute("aria-pressed", String(selected)); });
  $("#optional-goal-picker").innerHTML = OPTIONAL_NUTRIENTS.filter(({ key }) => GOAL_CATEGORIES[planCategory].includes(key)).map(({ key, label, unit }) => { const selected = Object.hasOwn(planDraft.optionalGoals, key); return `<div class="goal-tile ${selected ? "selected" : ""}"><label><input class="optional-goal-toggle" type="checkbox" value="${key}" ${selected ? "checked" : ""} /><span class="goal-check">${selected ? "✓" : "+"}</span><span><strong>${label}</strong><small>Daily target · ${unit}</small></span></label>${selected ? `<label class="goal-tile-input"><span class="sr-only">${label} daily target (${unit})</span><input class="optional-goal-value" data-nutrient="${key}" type="number" min="0" step="any" value="${planDraft.optionalGoals[key]}" placeholder="0" /><small>${unit}</small></label>` : ""}</div>`; }).join("");
  document.querySelectorAll(".optional-goal-toggle").forEach(input => input.addEventListener("change", () => { if (input.checked) planDraft.optionalGoals[input.value] = ""; else delete planDraft.optionalGoals[input.value]; state.planMessage = "Unsaved changes — select Save my plan."; renderOptionalGoals(); $("#plan-status").textContent = state.planMessage; }));
  document.querySelectorAll(".optional-goal-value").forEach(input => input.addEventListener("input", () => { planDraft.optionalGoals[input.dataset.nutrient] = input.value; state.planMessage = "Unsaved changes — select Save my plan."; $("#plan-status").textContent = state.planMessage; renderGoalSummary(); }));
  renderGoalSummary();
  renderOptionalProgress();
}

function renderDashboard() {
  const used = totals(); const left = remaining(); const logged = loggedMeals();
  const caloriesIncomplete = incompleteNutrient(todaysEntries(), "calories");
  const proteinIncomplete = incompleteNutrient(todaysEntries(), "proteinGrams");
  $("#goal-calories").value = planDraft.calories; $("#goal-protein").value = planDraft.protein;
  $("#pref-vegetarian").checked = planDraft.vegetarian; $("#pref-vegan").checked = planDraft.vegan; $("#pref-avoiding-gluten").checked = planDraft.avoidingGluten;
  $("#remaining-calories").textContent = left.calories === null ? "Set a goal" : `${caloriesIncomplete ? "Up to " : ""}${Math.max(0, left.calories)} cal`;
  $("#calorie-detail").textContent = state.goals.calories === "" ? "No daily target set" : `${caloriesIncomplete ? "At least " : ""}${used.calories} of ${state.goals.calories} cal logged${caloriesIncomplete ? " (some values missing)" : ""}`;
  $("#remaining-protein").textContent = left.protein === null ? "Set a goal" : `${proteinIncomplete ? "Up to " : ""}${Math.max(0, left.protein)}g`;
  $("#protein-detail").textContent = state.goals.protein === "" ? "No daily target set" : `${proteinIncomplete ? "At least " : ""}${used.protein}g of ${state.goals.protein}g logged${proteinIncomplete ? " (some values missing)" : ""}`;
  $("#log-note").textContent = logged.length ? `${logged.length} meal${logged.length === 1 ? "" : "s"} logged today. Known amounts are included; missing values may make totals incomplete.` : "Log a meal below to update your plan.";
  const todaysPairs = todaysEntries().map(entry => ({ entry, meal: window.MEALS.find(meal => meal.id === entry.id) })).filter(pair => pair.meal);
  $("#log-list").innerHTML = todaysPairs.map(({ entry, meal }) => `<span>${meal.name}<button class="remove-log" data-entry-id="${entry.entryId}" type="button" aria-label="Remove ${meal.name} from today's log">×</button></span>`).join("") || "<span class=\"empty-log\">Nothing logged yet</span>";
  $("#plan-status").textContent = state.planMessage || "Your plan stays in this browser until you change it.";
  renderOptionalGoals();
}

function renderQuickStatus(meals) {
  if (state.location && state.mealType) {
    $("#quick-status").textContent = meals.length ? `Showing ${meals.length} verified ${state.mealType} option${meals.length === 1 ? "" : "s"} at ${state.location}.` : `No verified ${state.mealType} records for ${state.location} are in this dataset yet.`;
    return;
  }
  if (state.location) {
    $("#quick-status").textContent = meals.length ? `Showing ${meals.length} verified option${meals.length === 1 ? "" : "s"} at ${state.location}.` : `No verified records for ${state.location} are in this dataset yet.`;
    return;
  }
  if (state.mealType) {
    $("#quick-status").textContent = meals.length ? `Showing ${meals.length} verified ${state.mealType} option${meals.length === 1 ? "" : "s"} across campus.` : `No verified ${state.mealType} records are in this dataset yet.`;
    return;
  }
  $("#quick-status").textContent = "";
}

function comparisonAdvice(meals) {
  if (meals.length !== 2) return { message: "Select two meals to see how they compare with your daily goals." };
  const goals = [
    { key: "calories", label: "calories", unit: " cal", target: state.goals.calories },
    { key: "proteinGrams", label: "protein", unit: "g", target: state.goals.protein },
    ...OPTIONAL_NUTRIENTS.map(nutrient => ({ ...nutrient, target: state.goals.optionalGoals[nutrient.key] }))
  ].filter(goal => goal.target !== "" && goal.target !== null && goal.target !== undefined && Number(goal.target) > 0);
  if (!goals.length) return { message: "Set a daily goal in Daily plan to get a personalized comparison." };

  const preferences = ["vegetarian", "vegan", "avoidingGluten"].filter(key => state.goals[key]);
  if (preferences.some(key => meals.some(meal => meal[key] !== true))) return { message: "No best fit shown: at least one meal does not have a verified label for your saved dietary preferences. Check its details and confirm with dining staff." };

  const entries = todaysEntries();
  const logged = mealsForEntries(entries);
  const hasValue = (item, key) => item[key] !== null && item[key] !== undefined && item[key] !== "" && Number.isFinite(Number(item[key]));
  if (logged.length !== entries.length || goals.some(goal => [...logged, ...meals].some(item => !hasValue(item, goal.key)))) {
    return { message: "No best fit shown: nutrition information needed for one or more of your goals is missing from these meals or today's log." };
  }

  const measures = goals.map(goal => {
    const consumed = logged.reduce((sum, meal) => sum + Number(meal[goal.key]), 0);
    return { ...goal, target: Number(goal.target), remaining: Math.max(0, Number(goal.target) - consumed) };
  });
  const scores = meals.map(meal => measures.reduce((sum, goal) => sum + Math.abs(goal.remaining - Number(meal[goal.key])) / goal.target, 0));
  if (Math.abs(scores[0] - scores[1]) < 0.000001) return { message: "These choices are equally close to your remaining tracked goals using the available data." };
  const winner = scores[0] < scores[1] ? 0 : 1;
  const details = measures.map(goal => `${goal.label}: ${Number(meals[winner][goal.key])}${goal.unit} of ${Number(goal.remaining.toFixed(1))}${goal.unit} remaining`).join("; ");
  return { winner, message: `Estimated fit: ${details}. Compares how close each meal gets to your remaining targets, weighting each saved goal equally; a meal can still exceed a target. Check portions and dietary labels.` };
}

function renderComparison() {
  const meals = state.selected.map(id => window.MEALS.find(meal => meal.id === id)); if (!meals.length) return;
  const known = key => meal => meal[key] !== null && meal[key] !== undefined;
  const labeled = key => meal => typeof meal[key] === "boolean";
  const rows = [
    ["Location", meal => meal.location, meal => Boolean(meal.location)],
    ["Serving size", meal => meal.servingSize, meal => Boolean(meal.servingSize)],
    ["Calories", meal => nutritionText(meal, "calories", " cal"), meal => known("calories")(meal) || typeof meal.partialNutrition?.calories === "number"],
    ["Protein", meal => proteinText(meal), meal => known("proteinGrams")(meal) || Boolean(meal.proteinDisplay) || typeof meal.partialNutrition?.proteinGrams === "number"],
    ["Carbs", meal => nutritionText(meal, "carbsGrams", "g"), meal => known("carbsGrams")(meal) || typeof meal.partialNutrition?.carbsGrams === "number"],
    ["Fat", meal => nutritionText(meal, "fatGrams", "g"), meal => known("fatGrams")(meal) || typeof meal.partialNutrition?.fatGrams === "number"],
    ["Vegetarian", meal => meal.vegetarian ? "Yes" : "No", labeled("vegetarian")],
    ["Vegan", meal => meal.vegan ? "Yes" : "No", labeled("vegan")],
    ["Avoiding gluten", meal => meal.avoidingGluten ? "Yes" : "No", labeled("avoidingGluten")]
  ].filter(([label, , available]) => ["Calories", "Protein", "Carbs", "Fat"].includes(label) ? meals.some(available) : meals.every(available));
  const advice = comparisonAdvice(meals);
  const missingNotes = meals.flatMap(meal => missingIngredientNotes(meal).map(note => `${meal.name}: ${note}`));
  $("#comparison-content").innerHTML = `<div class="compare-table ${meals.length === 1 ? "one-meal" : "two-meals"}"><div class="compare-head"><span>Metric</span>${meals.map((meal, index) => `<strong>${meal.name}${advice.winner === index ? '<span class="compare-fit">✓ Closer to your goals</span>' : ""}</strong>`).join("")}</div>${rows.map(([label, get]) => `<div class="compare-row"><span>${label}</span>${meals.map(meal => `<strong>${get(meal)}</strong>`).join("")}</div>`).join("")}</div>${missingNotes.length ? `<p class="comparison-advice">* Known subtotal. ${missingNotes.join(" ")} Known amounts are included in daily totals; missing amounts are unknown.</p>` : ""}<p class="comparison-advice" aria-live="polite">${advice.message}</p>`;
}

function showMealDetails(meal) {
  const dialog = $("#meal-detail-dialog");
  const nutritionFacts = item => [["Calories", nutritionText(item, "calories", " cal", null), ""], ["Protein", proteinText(item, null), ""], ...OPTIONAL_NUTRIENTS.map(({ key, label, unit }) => [label, typeof item[key] === "string" ? `${item[key]}${unit}` : nutritionText(item, key, unit, null), ""])].filter(([, value]) => value !== null && value !== undefined);
  const labels = item => [["Vegetarian", item.vegetarian], ["Vegan", item.vegan], ["Avoiding gluten", item.avoidingGluten]].filter(([, value]) => typeof value === "boolean");
  const factsHtml = item => { const facts = nutritionFacts(item); return facts.length ? `<div class="detail-facts">${facts.map(([label, value, unit]) => `<div><span>${label}</span><strong>${value}${unit}</strong></div>`).join("")}</div>` : `<p class="detail-serving">Nutrition information is unavailable for this item.</p>`; };
  const labelsHtml = item => { const dietaryFacts = labels(item); return dietaryFacts.length ? `<div class="detail-labels">${dietaryFacts.map(([label, value]) => `<span>${label}: ${value ? "Yes" : "No"}</span>`).join("")}</div>` : ""; };
  const allNutrients = [...CORE_NUTRIENTS, ...OPTIONAL_NUTRIENTS.filter(({ key }) => !CORE_NUTRIENTS.some(core => core.key === key))];
  const missingNotes = missingIngredientNotes(meal, allNutrients);
  const componentsHtml = meal.components?.length ? `<section class="component-breakdown"><h3>Nutrition by item</h3><p class="detail-serving">Values use each listed serving size. Missing values are not shown.</p>${meal.components.map(item => `<article class="component-detail"><h4>${item.name}</h4><p class="detail-serving">${text(item.servingSize, "Serving size unavailable")}</p>${factsHtml(item)}${labelsHtml(item)}</article>`).join("")}</section>` : "";
  $("#meal-detail-content").innerHTML = `<p class="eyebrow">${meal.location} · ${meal.category || "Menu item"}</p><h2 id="meal-detail-title">${meal.name}</h2><p class="detail-serving">${text(meal.servingSize, "Serving size unavailable")}</p>${meal.description ? `<p class="detail-description">${meal.description}</p>` : ""}${meal.isMealIdea ? `<p class="detail-description">Suggested combination using the listed servings. Confirm campus availability and portions; additions and sauces are not included.</p><h3 class="detail-section-title">Combined nutrition</h3>` : ""}${factsHtml(meal)}${missingNotes.length ? `<p class="detail-description">* Known subtotal. ${missingNotes.join(" ")} Known amounts are included in daily totals; missing amounts are unknown.</p>` : ""}${labelsHtml(meal)}${componentsHtml}<p class="detail-source">Nutrition source: Cal Poly Dining data · ${meal.verifiedAt}.</p>`;
  dialog.showModal();
}

function deleteLog(entryId) {
  state.entries = state.entries.filter(entry => entry.entryId !== entryId);
  localStorage.setItem("campusfuel-meal-history", JSON.stringify(state.entries));
  renderHistory();
  render();
}

function scrollToResults() {
  const target = !$("#best-match").hidden ? $("#best-match") : $("#discover-title");
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function formatDate(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });
}

function renderHistory() {
  const historyList = $("#history-list");
  const empty = $("#empty-history");
  const dates = [...new Set(state.entries.map(entry => entry.date))].sort((a, b) => b.localeCompare(a));
  historyList.hidden = dates.length === 0;
  empty.hidden = dates.length !== 0;
  historyList.innerHTML = dates.map(date => {
    const entries = state.entries.filter(entry => entry.date === date);
    const dayPairs = entries.map(entry => ({ entry, meal: window.MEALS.find(meal => meal.id === entry.id) })).filter(pair => pair.meal);
    const dayMeals = dayPairs.map(pair => pair.meal);
    const dayTotals = totals(entries);
    const goals = date === dateKey() ? state.goals : state.dailyGoals[date];
    const goalText = (value, unit) => value !== undefined && value !== null && value !== "" ? `out of ${value}${unit} goal` : "Goal not recorded";
    const optionalTotals = nutrientTotals(entries);
    const optionalCards = OPTIONAL_NUTRIENTS.filter(({ key }) => goals?.optionalGoals?.[key] !== undefined && goals.optionalGoals[key] !== "").map(({ key, label, unit }) => `<div><strong>${incompleteNutrient(entries, key) ? "At least " : ""}${optionalTotals[key]}${unit}</strong><span>${label} · ${goalText(goals.optionalGoals[key], unit)}</span></div>`).join("");
    return `<article class="history-day"><div class="history-date"><div><p class="eyebrow">${date === dateKey() ? "TODAY" : "MEAL LOG"}</p><h2>${formatDate(date)}</h2></div><span>${dayMeals.length} meal${dayMeals.length === 1 ? "" : "s"} logged</span></div><div class="history-totals"><div><strong>${incompleteNutrient(entries, "calories") ? "At least " : ""}${dayTotals.calories} cal</strong><span>${goalText(goals?.calories, " cal")}</span></div><div><strong>${incompleteNutrient(entries, "proteinGrams") ? "At least " : ""}${dayTotals.protein}g protein</strong><span>${goalText(goals?.protein, "g")}</span></div>${optionalCards}</div><div class="history-meals">${dayPairs.map(({ entry, meal }) => `<span>${meal.name}<small>${meal.location}</small><button class="remove-log" data-entry-id="${entry.entryId}" type="button" aria-label="Remove ${meal.name} from history">×</button></span>`).join("")}</div><p class="history-note">“At least” means some values are missing; known amounts are included. The goal shown is the last one saved that day.</p></article>`;
  }).join("");
}

function switchView(view) {
  state.view = view;
  $("#dashboard-view").hidden = view !== "dashboard";
  $("#finder-view").hidden = view !== "finder";
  $("#finder-results").hidden = view !== "finder";
  $("#daily-summary").hidden = view === "history";
  $("#history-view").hidden = view !== "history";
  document.querySelectorAll(".app-tab").forEach(button => { const selected = button.dataset.view === view; button.classList.toggle("active", selected); button.setAttribute("aria-current", selected ? "page" : "false"); });
  if (view === "history") {
    renderHistory();
    document.querySelectorAll("#history-list .remove-log").forEach(button => button.addEventListener("click", () => deleteLog(button.dataset.entryId)));
  }
}

function browseCategory(meal) {
  if (meal.isMealIdea) return "Meal ideas";
  const category = meal.category || "";
  if (category === "Salad" && /salad/i.test(meal.name) && /bowl|plate|serving/i.test(meal.servingSize || "")) return "Ready-to-eat salads";
  if (category.startsWith("BYO - ")) return `Build your own: ${category.slice(6)}`;
  if (category.includes("Salad/Wrap")) return `${category} ingredients`;
  if (["Entrees", "Chicken", "Beef", "Seafood", "Vegetables"].includes(category)) return "Entrées and proteins";
  if (["Sides", "Appetizers"].includes(category)) return "Sides and appetizers";
  if (["Condiments", "Dipping Sauces"].includes(category)) return "Sauces and condiments";
  if (category === "LTO's") return "Specials";
  return category || "Other items";
}

function render() {
  const openCategories = new Set([...mealGrid.querySelectorAll(".browse-category[open]")].map(group => group.dataset.group));
  const active = Boolean(state.query || state.maxCalories || state.minProtein || state.diet || state.location || state.mealType || state.suggestionMode);
  const recommendations = filteredMeals(true).sort((a, b) => scoreMeal(a) - scoreMeal(b));
  const allResults = active ? recommendations : filteredMeals(false);
  const meals = allResults.filter(meal => !state.restaurantTab || meal.location === state.restaurantTab);
  const restaurants = [...new Set(meals.map(meal => meal.location))].sort((a, b) => a.localeCompare(b));
  mealGrid.innerHTML = restaurants.map(restaurant => {
    const items = meals.filter(meal => meal.location === restaurant);
    if (!active) items.sort((a, b) => a.name.localeCompare(b.name) || (a.servingSize || "").localeCompare(b.servingSize || ""));
    const categories = [...new Set(items.map(browseCategory))].sort((a, b) => a.localeCompare(b));
    return `<section class="restaurant-group"><h4>${restaurant} <span>${items.length} items</span></h4>${categories.map(category => {
      const categoryItems = items.filter(item => browseCategory(item) === category);
      const group = `${restaurant} / ${category}`;
      const open = state.query || openCategories.has(group) ? " open" : "";
      return `<details class="browse-category" data-group="${group}"${open}><summary><span>${category}</span><small>${categoryItems.length} options</small></summary><div class="meal-grid">${categoryItems.map(mealCard).join("")}</div></details>`;
    }).join("")}</section>`;
  }).join("");
  mealGrid.hidden = meals.length === 0; emptyState.hidden = meals.length !== 0;
  document.querySelectorAll(".restaurant-tab").forEach(button => { const selected = button.dataset.restaurant === state.restaurantTab; button.classList.toggle("active", selected); button.setAttribute("aria-pressed", String(selected)); });
  $("#browse-note").textContent = active ? "Showing results matching your search and saved dietary preferences. Choose a category to browse." : "Choose a restaurant and open a category to explore. This full browse is not filtered by saved dietary preferences; check labels before choosing.";
  $("#empty-title").textContent = state.location && state.mealType ? `No verified ${state.mealType} options at ${state.location} yet.` : state.location ? `No verified ${state.location} meals yet.` : state.mealType ? `No verified ${state.mealType} options yet.` : "No verified exact matches yet.";
  $("#empty-copy").textContent = state.location || state.mealType ? "This is a data-coverage gap, not a negative result. Try another option or add verified records for this category." : "Try removing a filter. CampusFuel will show transparent alternatives as the verified dataset grows.";
  $("#result-summary").textContent = active ? `${meals.length} match${meals.length === 1 ? "" : "es"}` : `${meals.length} items and meal ideas`;
  renderDashboard(); renderBestMatch(state.query.trim() ? recommendations.filter(meal => !state.restaurantTab || meal.location === state.restaurantTab) : []); renderQuickStatus(meals); renderComparison();
  document.querySelectorAll(".compare-button").forEach(button => button.addEventListener("click", () => toggleCompare(button.dataset.mealId)));
  document.querySelectorAll(".log-button").forEach(button => button.addEventListener("click", () => { const mealId = button.dataset.logId; state.entries.push({ id: mealId, date: dateKey(), entryId: `${mealId}-${Date.now()}-${Math.random().toString(36).slice(2)}` }); localStorage.setItem("campusfuel-meal-history", JSON.stringify(state.entries)); saveTodaysGoals(); render(); confirmMealLogged(mealId); }));
  document.querySelectorAll(".meal-card").forEach(card => {
    const openDetails = event => { if (event.target.closest("button")) return; showMealDetails(window.MEALS.find(meal => meal.id === card.dataset.mealId)); };
    card.addEventListener("click", openDetails);
    card.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openDetails(event); } });
  });
  document.querySelectorAll(".remove-log").forEach(button => button.addEventListener("click", () => deleteLog(button.dataset.entryId)));
}

function toggleCompare(id) {
  const addingMeal = !state.selected.includes(id);
  if (state.selected.includes(id)) state.selected = state.selected.filter(item => item !== id);
  else if (state.selected.length < 2) state.selected = [...state.selected, id];
  else return;
  render();
  if (addingMeal && state.selected.length === 2) openComparison();
}
function openComparison() { const dialog = $("#comparison"); if (state.selected.length === 2 && !dialog.open) dialog.showModal(); }
function clearAll() { Object.assign(state, { query: "", maxCalories: "", minProtein: "", diet: "", location: "", mealType: "", restaurantTab: "", suggestionMode: false }); $("#meal-query").value = ""; updateBrowseButtons(); render(); }
function updateBrowseButtons() { document.querySelectorAll(".browse-chip").forEach(button => { const selected = button.dataset.location ? button.dataset.location === state.location : button.dataset.mealType === state.mealType; button.classList.toggle("selected", selected); }); }

$("#search-form").addEventListener("submit", event => { event.preventDefault(); Object.assign(state, { query: $("#meal-query").value.trim(), maxCalories: "", minProtein: "", diet: "", restaurantTab: "", suggestionMode: false }); interpretQuery(state.query); render(); scrollToResults(); });
$("#meal-query").addEventListener("input", event => { if (!event.target.value.trim()) clearAll(); });
[["#goal-calories", "calories"], ["#goal-protein", "protein"]].forEach(([selector, key]) => $(selector).addEventListener("input", event => { planDraft[key] = event.target.value; state.planMessage = "Unsaved changes — select Save my plan."; $("#plan-status").textContent = state.planMessage; renderGoalSummary(); }));
[["#pref-vegetarian", "vegetarian"], ["#pref-vegan", "vegan"], ["#pref-avoiding-gluten", "avoidingGluten"]].forEach(([selector, key]) => $(selector).addEventListener("change", event => { planDraft[key] = event.target.checked; state.planMessage = "Unsaved changes — select Save my plan."; $("#plan-status").textContent = state.planMessage; }));
document.querySelectorAll(".goal-category").forEach(button => button.addEventListener("click", () => { planCategory = button.dataset.category; renderOptionalGoals(); }));
$("#goals-form").addEventListener("submit", event => {
  event.preventDefault();
  const invalid = OPTIONAL_NUTRIENTS.find(({ key }) => { const value = planDraft.optionalGoals[key]; return value !== undefined && value !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0); });
  if (invalid) {
    planCategory = Object.keys(GOAL_CATEGORIES).find(category => GOAL_CATEGORIES[category].includes(invalid.key));
    renderOptionalGoals();
    state.planMessage = `Please enter a non-negative ${invalid.label.toLowerCase()} target before saving.`;
    $("#plan-status").textContent = state.planMessage;
    document.querySelector(`.optional-goal-value[data-nutrient="${invalid.key}"]`)?.focus();
    return;
  }
  const savedPlan = { ...planDraft, optionalGoals: { ...planDraft.optionalGoals } };
  try { localStorage.setItem("campusfuel-goals", JSON.stringify(savedPlan)); }
  catch { state.planMessage = "Your browser couldn’t save this plan. Check your browser storage settings and try again."; $("#plan-status").textContent = state.planMessage; return; }
  state.goals = savedPlan;
  state.planMessage = "Saved — these targets will stay on this device until you change them.";
  if (todaysEntries().length) saveTodaysGoals();
  render();
});
$("#reset-empty").addEventListener("click", clearAll);
$("#close-comparison").addEventListener("click", () => $("#comparison").close());
$("#comparison").addEventListener("close", () => { state.selected = []; render(); });
$("#clear-log").addEventListener("click", () => { state.entries = state.entries.filter(entry => entry.date !== dateKey()); localStorage.setItem("campusfuel-meal-history", JSON.stringify(state.entries)); render(); });
$("#clear-history").addEventListener("click", () => { state.entries = []; localStorage.removeItem("campusfuel-meal-history"); localStorage.removeItem("campusfuel-today-log"); renderHistory(); render(); });
document.querySelectorAll(".app-tab").forEach(button => button.addEventListener("click", () => switchView(button.dataset.view)));
document.querySelectorAll(".go-finder").forEach(button => button.addEventListener("click", () => switchView("finder")));
document.querySelectorAll(".browse-chip").forEach(button => button.addEventListener("click", () => {
  const isLocation = Boolean(button.dataset.location);
  const value = isLocation ? button.dataset.location : button.dataset.mealType;
  const wasSelected = isLocation ? state.location === value : state.mealType === value;
  state.suggestionMode = false;
  if (isLocation) state.location = wasSelected ? "" : value;
  else state.mealType = wasSelected ? "" : value;
  state.restaurantTab = "";
  updateBrowseButtons(); render();
}));
document.querySelectorAll(".restaurant-tab").forEach(button => button.addEventListener("click", () => { state.location = ""; state.restaurantTab = button.dataset.restaurant; updateBrowseButtons(); render(); }));
$("#suggest-next").addEventListener("click", () => { Object.assign(state, { query: "meal", maxCalories: "", minProtein: "", diet: "", restaurantTab: "", suggestionMode: true }); $("#meal-query").value = "meal"; render(); scrollToResults(); });
$("#close-meal-detail").addEventListener("click", () => $("#meal-detail-dialog").close());
$("#coverage-note").textContent = `Dataset last updated: ${[...new Set(window.MEALS.map(meal => meal.verifiedAt))].join(", ")}.`;
render();
let displayedDate = dateKey();
let dayRefreshTimer;
function refreshForNewDay() {
  if (dateKey() !== displayedDate) { displayedDate = dateKey(); render(); if (state.view === "history") switchView("history"); }
}
function scheduleDayRefresh() {
  clearTimeout(dayRefreshTimer);
  const next = new Date(); next.setHours(24, 0, 0, 0);
  dayRefreshTimer = setTimeout(() => { refreshForNewDay(); scheduleDayRefresh(); }, Math.max(1000, next.getTime() - Date.now() + 100));
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) { refreshForNewDay(); scheduleDayRefresh(); } });
window.addEventListener("focus", () => { refreshForNewDay(); scheduleDayRefresh(); });
scheduleDayRefresh();
