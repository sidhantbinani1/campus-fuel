const $ = (selector) => document.querySelector(selector);
const mealGrid = $("#meal-grid");
const emptyState = $("#empty-state");
const storedGoals = JSON.parse(localStorage.getItem("campusfuel-goals") || "{}");
const storedLog = JSON.parse(localStorage.getItem("campusfuel-meal-history") || localStorage.getItem("campusfuel-today-log") || "[]");
const dateKey = (date = new Date()) => date.toLocaleDateString("en-CA");
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
  query: "", maxPrice: "", maxCalories: "", minProtein: "", diet: "", location: "", mealType: "", suggestionMode: false, selected: [],
  goals: { calories: storedGoals.calories || "", protein: storedGoals.protein || "", balance: storedGoals.balance || "", vegetarian: Boolean(storedGoals.vegetarian), vegan: Boolean(storedGoals.vegan), avoidingGluten: Boolean(storedGoals.avoidingGluten), optionalGoals: storedOptionalGoals },
  entries: normalizedEntries,
  view: "dashboard", planMessage: ""
};

const number = (value) => Number(value) || 0;
const text = (value, fallback = "Unavailable") => value === null || value === undefined || value === "" ? fallback : value;
const badge = (label, kind = "neutral") => `<span class="badge ${kind}">${label}</span>`;
const mealsForEntries = (entries) => entries.map(entry => window.MEALS.find(meal => meal.id === entry.id)).filter(Boolean);
const todaysEntries = () => state.entries.filter(entry => entry.date === dateKey());
const loggedMeals = () => mealsForEntries(todaysEntries());
const totals = (entries = todaysEntries()) => mealsForEntries(entries).reduce((total, meal) => ({ calories: total.calories + number(meal.calories), protein: total.protein + number(meal.proteinGrams), price: total.price + number(meal.price) }), { calories: 0, protein: 0, price: 0 });
const nutrientTotals = (entries = todaysEntries()) => mealsForEntries(entries).reduce((total, meal) => { OPTIONAL_NUTRIENTS.forEach(({ key }) => { total[key] += number(meal[key]); }); return total; }, Object.fromEntries(OPTIONAL_NUTRIENTS.map(({ key }) => [key, 0])));
const remaining = () => { const used = totals(); return { calories: state.goals.calories === "" ? null : number(state.goals.calories) - used.calories, protein: state.goals.protein === "" ? null : number(state.goals.protein) - used.protein, balance: state.goals.balance === "" ? null : number(state.goals.balance) - used.price }; };

function interpretQuery(query) {
  const queryText = query.toLowerCase();
  const calories = queryText.match(/(?:under|below|less than|up to|max(?:imum)?)[^0-9]{0,12}(\d{2,4})\s*(?:cal|calorie)?/);
  const protein = queryText.match(/(?:at least|min(?:imum)?|more than)[^0-9]{0,12}(\d{1,3})\s*(?:g|grams?)\s*(?:of\s*)?protein/);
  const price = queryText.match(/(?:under|below|less than|up to|max(?:imum)?)[^0-9]{0,12}\$?(\d{1,3})(?:\.\d{1,2})?\s*(?:dollars?|bucks?|\$)?/);
  if (calories) state.maxCalories = calories[1];
  if (protein) state.minProtein = protein[1];
  if (price && (queryText.includes("dollar") || queryText.includes("buck") || queryText.includes("$"))) state.maxPrice = price[1];
  if (queryText.includes("vegetarian")) state.diet = "vegetarian";
  if (queryText.includes("vegan")) state.diet = "vegan";
  syncControls();
}

function filteredMeals() {
  const ignored = ["under", "calories", "calorie", "vegetarian", "protein", "vegan", "grams", "dollars", "dollar", "need"];
  const words = state.query.toLowerCase().split(/\s+/).filter(word => word.length > 3 && !ignored.includes(word));
  return window.MEALS.filter(meal => {
    if (state.location && meal.location !== state.location) return false;
    if (state.mealType && meal.mealType !== state.mealType) return false;
    if (state.maxPrice && (meal.price === null || meal.price > number(state.maxPrice))) return false;
    if (state.maxCalories && (meal.calories === null || meal.calories > number(state.maxCalories))) return false;
    if (state.minProtein && (meal.proteinGrams === null || meal.proteinGrams < number(state.minProtein))) return false;
    if (state.diet && meal[state.diet] !== true) return false;
    if (state.goals.vegetarian && meal.vegetarian !== true) return false;
    if (state.goals.vegan && meal.vegan !== true) return false;
    if (state.goals.avoidingGluten && meal.avoidingGluten !== true) return false;
    return !words.length || words.some(word => `${meal.name} ${meal.location} ${meal.description || ""}`.toLowerCase().includes(word));
  });
}

function mealReason(meal) {
  const left = remaining(); const reasons = [];
  if (state.maxCalories && meal.calories <= number(state.maxCalories)) reasons.push(`${meal.calories} calories, within your limit`);
  else if (left.calories !== null && meal.calories !== null && meal.calories <= left.calories) reasons.push(`${meal.calories} calories, within today's remaining target`);
  if (state.maxPrice && meal.price !== null && meal.price <= number(state.maxPrice)) reasons.push(`$${meal.price.toFixed(2)}, within your budget`);
  else if (left.balance !== null && meal.price !== null && meal.price <= left.balance) reasons.push("within your Dining Dollars estimate");
  if (state.minProtein && meal.proteinGrams >= number(state.minProtein)) reasons.push(`${meal.proteinGrams}g protein, meeting your goal`);
  if (state.diet && meal[state.diet] === true) reasons.push(`verified ${state.diet}`);
  if (state.goals.avoidingGluten && meal.avoidingGluten === true) reasons.push("verified avoiding-gluten label");
  return reasons.length ? reasons.join(" · ") : "Verified meal record in the current dataset";
}

function mealCard(meal) {
  const chosen = state.selected.includes(meal.id);
  const labels = [meal.vegetarian === true ? badge("Vegetarian", "green") : "", meal.vegan === true ? badge("Vegan", "green") : ""].join("");
  return `<article class="meal-card" data-meal-id="${meal.id}" tabindex="0" role="button" aria-label="View nutrition facts for ${meal.name}"><div class="card-top"><span class="location">${meal.location}</span></div><h3>${meal.name}</h3><p class="serving">${text(meal.servingSize, "Serving size unavailable")}</p><div class="stats"><div><strong>${text(meal.calories)}</strong><span>${meal.calories === null ? "Calories" : "calories"}</span></div><div><strong>${meal.proteinGrams === null ? "—" : meal.proteinGrams + "g"}</strong><span>protein</span></div><div><strong>${meal.carbsGrams === null ? "—" : meal.carbsGrams + "g"}</strong><span>carbs</span></div><div><strong>${meal.fatGrams === null ? "—" : meal.fatGrams + "g"}</strong><span>fat</span></div></div><div class="badges">${labels || badge("More labels pending verification")}</div><p class="match-reason">${mealReason(meal)}</p><div class="card-actions"><button class="compare-button ${chosen ? "selected" : ""}" data-meal-id="${meal.id}" type="button" ${!chosen && state.selected.length >= 2 ? "disabled" : ""}>${chosen ? "Selected to compare ✓" : "Compare meal"}</button><button class="log-button" data-log-id="${meal.id}" type="button">Log meal +</button></div></article>`;
}

function scoreMeal(meal) {
  const left = remaining(); let score = 0;
  if (left.protein !== null && meal.proteinGrams !== null) score -= Math.min(meal.proteinGrams, Math.max(left.protein, 0)) * 5;
  if (left.calories !== null && meal.calories !== null) score += meal.calories > left.calories ? 1000 + meal.calories : meal.calories / 100;
  if (left.balance !== null && meal.price !== null) score += meal.price > left.balance ? 1000 + meal.price : meal.price / 100;
  return score;
}

function renderBestMatch(meals) {
  const target = $("#best-match");
  if (!meals.length) { target.innerHTML = ""; target.hidden = true; return; }
  const meal = meals[0];
  const title = state.suggestionMode ? "Idea based on what you have left today" : [state.maxPrice, state.maxCalories, state.minProtein, state.diet, state.location, state.mealType].some(Boolean) ? "Best match for your request" : state.goals.protein || state.goals.calories ? "Best fit for today's plan" : "Start with this verified choice";
  target.hidden = false;
  target.innerHTML = `<div class="best-mark">✦ <span>TOP PICK</span></div><div class="best-copy"><p class="eyebrow">${title}</p><h3><button class="best-detail" type="button">${meal.name}</button></h3><p>${meal.location} · ${mealReason(meal)}</p></div><div class="best-stats"><strong>${text(meal.calories)}</strong><span>${meal.calories === null ? "Calories unavailable" : "calories"}</span></div><button class="best-compare" type="button">Compare options →</button>`;
  target.onclick = event => { if (!event.target.closest(".best-compare")) showMealDetails(meal); };
  $(".best-compare").addEventListener("click", () => { if (!state.selected.includes(meal.id)) toggleCompare(meal.id); $("#comparison").scrollIntoView({ behavior: "smooth" }); });
}

function renderOptionalGoalInputs() {
  const draftValues = Object.fromEntries([...document.querySelectorAll(".optional-goal-value")].map(input => [input.dataset.nutrient, input.value]));
  const selected = [...document.querySelectorAll(".optional-goal-toggle:checked")].map(input => input.value);
  $("#optional-goal-inputs").innerHTML = selected.map(key => {
    const nutrient = OPTIONAL_NUTRIENTS.find(item => item.key === key);
    const value = draftValues[nutrient.key] ?? state.goals.optionalGoals[nutrient.key] ?? "";
    return `<label>${nutrient.label} <span>(${nutrient.unit})</span><input class="optional-goal-value" data-nutrient="${nutrient.key}" type="number" min="0" step="any" value="${value}" placeholder="Daily target" /></label>`;
  }).join("");
}

function saveOptionalGoalDraft() {
  state.goals.optionalGoals = Object.fromEntries([...document.querySelectorAll(".optional-goal-toggle:checked")].map(input => [input.value, document.querySelector(`.optional-goal-value[data-nutrient="${input.value}"]`)?.value || ""]));
  localStorage.setItem("campusfuel-goals", JSON.stringify(state.goals));
}

function renderOptionalProgress() {
  const used = nutrientTotals();
  const tracked = OPTIONAL_NUTRIENTS.filter(({ key }) => state.goals.optionalGoals[key] !== undefined && state.goals.optionalGoals[key] !== "");
  $("#optional-progress").innerHTML = tracked.map(({ key, label, unit }) => `<div class="optional-progress-card"><span>${label} remaining</span><strong>${Math.max(0, number(state.goals.optionalGoals[key]) - used[key])}${unit}</strong><small>${used[key]} of ${state.goals.optionalGoals[key]}${unit} logged</small></div>`).join("");
}

function renderOptionalGoals() {
  $("#optional-goal-picker").innerHTML = OPTIONAL_NUTRIENTS.map(({ key, label, unit }) => `<label><input class="optional-goal-toggle" type="checkbox" value="${key}" ${Object.hasOwn(state.goals.optionalGoals, key) ? "checked" : ""} /> ${label} <small>${unit}</small></label>`).join("");
  document.querySelectorAll(".optional-goal-toggle").forEach(input => input.addEventListener("change", () => { saveOptionalGoalDraft(); renderOptionalGoalInputs(); renderOptionalProgress(); }));
  renderOptionalGoalInputs();
  document.querySelectorAll(".optional-goal-value").forEach(input => input.addEventListener("input", () => { saveOptionalGoalDraft(); renderOptionalProgress(); }));
  renderOptionalProgress();
}

function renderDashboard() {
  const used = totals(); const left = remaining(); const logged = loggedMeals();
  $("#goal-calories").value = state.goals.calories; $("#goal-protein").value = state.goals.protein; $("#balance-input").value = state.goals.balance;
  $("#pref-vegetarian").checked = state.goals.vegetarian; $("#pref-vegan").checked = state.goals.vegan; $("#pref-avoiding-gluten").checked = state.goals.avoidingGluten;
  $("#remaining-calories").textContent = left.calories === null ? "Set a goal" : `${Math.max(0, left.calories)} cal`;
  $("#calorie-detail").textContent = state.goals.calories === "" ? "No daily target set" : `${used.calories} of ${state.goals.calories} cal logged`;
  $("#remaining-protein").textContent = left.protein === null ? "Set a goal" : `${Math.max(0, left.protein)}g`;
  $("#protein-detail").textContent = state.goals.protein === "" ? "No daily target set" : `${used.protein}g of ${state.goals.protein}g logged`;
  $("#remaining-balance").textContent = left.balance === null ? "Set balance" : `$${Math.max(0, left.balance).toFixed(2)}`;
  $("#balance-detail").textContent = state.goals.balance === "" ? "Private planning estimate" : `$${used.price.toFixed(2)} in verified-priced meals logged`;
  $("#log-note").textContent = logged.length ? `${logged.length} meal${logged.length === 1 ? "" : "s"} logged today. Unknown nutrition or price fields are not added to totals.` : "Log a verified meal below to update your plan.";
  const todaysPairs = todaysEntries().map(entry => ({ entry, meal: window.MEALS.find(meal => meal.id === entry.id) })).filter(pair => pair.meal);
  $("#log-list").innerHTML = todaysPairs.map(({ entry, meal }) => `<span>${meal.name}<button class="remove-log" data-entry-id="${entry.entryId}" type="button" aria-label="Remove ${meal.name} from today's log">×</button></span>`).join("") || "<span class=\"empty-log\">Nothing logged yet</span>";
  $("#plan-status").textContent = state.planMessage;
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

function renderComparison() {
  const section = $("#comparison"); const meals = state.selected.map(id => window.MEALS.find(meal => meal.id === id)); section.hidden = meals.length === 0; if (!meals.length) return;
  const known = key => meal => meal[key] !== null && meal[key] !== undefined;
  const labeled = key => meal => typeof meal[key] === "boolean";
  const rows = [
    ["Location", meal => meal.location, meal => Boolean(meal.location)],
    ["Serving size", meal => meal.servingSize, meal => Boolean(meal.servingSize)],
    ["Calories", meal => `${meal.calories} cal`, known("calories")],
    ["Protein", meal => `${meal.proteinGrams}g`, known("proteinGrams")],
    ["Carbs", meal => `${meal.carbsGrams}g`, known("carbsGrams")],
    ["Fat", meal => `${meal.fatGrams}g`, known("fatGrams")],
    ["Price", meal => `$${meal.price.toFixed(2)}`, known("price")],
    ["Vegetarian", meal => meal.vegetarian ? "Yes" : "No", labeled("vegetarian")],
    ["Vegan", meal => meal.vegan ? "Yes" : "No", labeled("vegan")],
    ["Avoiding gluten", meal => meal.avoidingGluten ? "Yes" : "No", labeled("avoidingGluten")]
  ].filter(([, , available]) => meals.every(available));
  $("#comparison-content").innerHTML = `<div class="compare-table"><div class="compare-head"><span>Metric</span>${meals.map(meal => `<strong>${meal.name}</strong>`).join("")}</div>${rows.map(([label, get]) => `<div class="compare-row"><span>${label}</span>${meals.map(meal => `<strong>${get(meal)}</strong>`).join("")}</div>`).join("")}</div>`;
}

function showMealDetails(meal) {
  const dialog = $("#meal-detail-dialog");
  const mainFacts = [["Calories", meal.calories, "cal"], ["Protein", meal.proteinGrams, "g"], ...OPTIONAL_NUTRIENTS.map(({ key, label, unit }) => [label, meal[key], unit])]
    .filter(([, value]) => value !== null && value !== undefined);
  const dietaryFacts = [["Vegetarian", meal.vegetarian], ["Vegan", meal.vegan], ["Avoiding gluten", meal.avoidingGluten]].filter(([, value]) => typeof value === "boolean");
  $("#meal-detail-content").innerHTML = `<p class="eyebrow">${meal.location} · ${meal.category || "Menu item"}</p><h2 id="meal-detail-title">${meal.name}</h2><p class="detail-serving">${text(meal.servingSize, "Serving size unavailable")}</p>${meal.description ? `<p class="detail-description">${meal.description}</p>` : ""}<div class="detail-facts">${mainFacts.map(([label, value, unit]) => `<div><span>${label}</span><strong>${value}${unit}</strong></div>`).join("")}</div>${dietaryFacts.length ? `<div class="detail-labels">${dietaryFacts.map(([label, value]) => `<span>${label}: ${value ? "Yes" : "No"}</span>`).join("")}</div>` : ""}<p class="detail-source">Nutrition source: Cal Poly Dining data · ${meal.verifiedAt}</p>`;
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
    return `<article class="history-day"><div class="history-date"><div><p class="eyebrow">${date === dateKey() ? "TODAY" : "MEAL LOG"}</p><h2>${formatDate(date)}</h2></div><span>${dayMeals.length} meal${dayMeals.length === 1 ? "" : "s"} logged</span></div><div class="history-totals"><div><strong>${dayTotals.calories || "—"}</strong><span>calories logged</span></div><div><strong>${dayTotals.protein ? `${dayTotals.protein}g` : "—"}</strong><span>protein logged</span></div><div><strong>${dayTotals.price ? `$${dayTotals.price.toFixed(2)}` : "—"}</strong><span>verified-price spend</span></div></div><div class="history-meals">${dayPairs.map(({ entry, meal }) => `<span>${meal.name}<small>${meal.location}</small><button class="remove-log" data-entry-id="${entry.entryId}" type="button" aria-label="Remove ${meal.name} from history">×</button></span>`).join("")}</div><p class="history-note">Only verified calorie, protein, and price values are added to the daily totals.</p></article>`;
  }).join("");
}

function switchView(view) {
  state.view = view;
  $("#dashboard-view").hidden = view !== "dashboard";
  $("#history-view").hidden = view !== "history";
  document.querySelectorAll(".app-tab").forEach(button => { const selected = button.dataset.view === view; button.classList.toggle("active", selected); button.setAttribute("aria-current", selected ? "page" : "false"); });
  if (view === "history") {
    renderHistory();
    document.querySelectorAll("#history-list .remove-log").forEach(button => button.addEventListener("click", () => deleteLog(button.dataset.entryId)));
  }
}

function render() {
  const meals = filteredMeals().sort((a, b) => scoreMeal(a) - scoreMeal(b)); const active = Boolean(state.query || state.maxPrice || state.maxCalories || state.minProtein || state.diet || state.location || state.mealType);
  mealGrid.innerHTML = meals.map(mealCard).join(""); mealGrid.hidden = meals.length === 0; emptyState.hidden = meals.length !== 0;
  $("#empty-title").textContent = state.location && state.mealType ? `No verified ${state.mealType} options at ${state.location} yet.` : state.location ? `No verified ${state.location} meals yet.` : state.mealType ? `No verified ${state.mealType} options yet.` : "No verified exact matches yet.";
  $("#empty-copy").textContent = state.location || state.mealType ? "This is a data-coverage gap, not a negative result. Try another option or add verified records for this category." : "Try removing a filter. CampusFuel will show transparent alternatives as the verified dataset grows.";
  $("#result-summary").textContent = active ? `${meals.length} verified match${meals.length === 1 ? "" : "es"}` : `${window.MEALS.length} verified meals`;
  renderDashboard(); renderBestMatch(meals); renderQuickStatus(meals); renderComparison();
  document.querySelectorAll(".compare-button").forEach(button => button.addEventListener("click", () => toggleCompare(button.dataset.mealId)));
  document.querySelectorAll(".log-button").forEach(button => button.addEventListener("click", () => { state.entries.push({ id: button.dataset.logId, date: dateKey(), entryId: `${button.dataset.logId}-${Date.now()}-${Math.random().toString(36).slice(2)}` }); localStorage.setItem("campusfuel-meal-history", JSON.stringify(state.entries)); render(); }));
  document.querySelectorAll(".meal-card").forEach(card => {
    const openDetails = event => { if (event.target.closest("button")) return; showMealDetails(window.MEALS.find(meal => meal.id === card.dataset.mealId)); };
    card.addEventListener("click", openDetails);
    card.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openDetails(event); } });
  });
  document.querySelectorAll(".remove-log").forEach(button => button.addEventListener("click", () => deleteLog(button.dataset.entryId)));
}

function toggleCompare(id) { state.selected = state.selected.includes(id) ? state.selected.filter(item => item !== id) : [...state.selected, id]; render(); }
function syncControls() { $("#price-filter").value = state.maxPrice; $("#calorie-filter").value = state.maxCalories; $("#protein-filter").value = state.minProtein; $("#diet-filter").value = state.diet; }
function clearAll() { Object.assign(state, { query: "", maxPrice: "", maxCalories: "", minProtein: "", diet: "", location: "", mealType: "", suggestionMode: false }); $("#meal-query").value = ""; syncControls(); updateBrowseButtons(); render(); }
function updateBrowseButtons() { document.querySelectorAll(".browse-chip").forEach(button => { const selected = button.dataset.location ? button.dataset.location === state.location : button.dataset.mealType === state.mealType; button.classList.toggle("selected", selected); }); }

$("#search-form").addEventListener("submit", event => { event.preventDefault(); state.query = $("#meal-query").value.trim(); state.suggestionMode = false; interpretQuery(state.query); render(); scrollToResults(); });
$("#goals-form").addEventListener("submit", event => {
  event.preventDefault();
  const optionalGoals = Object.fromEntries([...document.querySelectorAll(".optional-goal-toggle:checked")].map(input => [input.value, document.querySelector(`.optional-goal-value[data-nutrient="${input.value}"]`)?.value || ""]));
  state.goals = { calories: $("#goal-calories").value, protein: $("#goal-protein").value, balance: $("#balance-input").value, vegetarian: $("#pref-vegetarian").checked, vegan: $("#pref-vegan").checked, avoidingGluten: $("#pref-avoiding-gluten").checked, optionalGoals };
  state.planMessage = "Saved — these targets will stay on this device until you change them.";
  localStorage.setItem("campusfuel-goals", JSON.stringify(state.goals));
  render();
});
$("#price-filter").addEventListener("change", event => { state.maxPrice = event.target.value; render(); }); $("#calorie-filter").addEventListener("change", event => { state.maxCalories = event.target.value; render(); }); $("#protein-filter").addEventListener("change", event => { state.minProtein = event.target.value; render(); }); $("#diet-filter").addEventListener("change", event => { state.diet = event.target.value; render(); });
$("#clear-filters").addEventListener("click", clearAll); $("#reset-empty").addEventListener("click", clearAll); $("#close-comparison").addEventListener("click", () => { state.selected = []; render(); });
$("#clear-log").addEventListener("click", () => { state.entries = state.entries.filter(entry => entry.date !== dateKey()); localStorage.setItem("campusfuel-meal-history", JSON.stringify(state.entries)); render(); });
$("#clear-history").addEventListener("click", () => { state.entries = []; localStorage.removeItem("campusfuel-meal-history"); localStorage.removeItem("campusfuel-today-log"); renderHistory(); render(); });
document.querySelectorAll(".app-tab").forEach(button => button.addEventListener("click", () => switchView(button.dataset.view)));
document.querySelectorAll(".go-dashboard").forEach(button => button.addEventListener("click", () => switchView("dashboard")));
document.querySelectorAll(".prompt-chip").forEach(button => button.addEventListener("click", () => { $("#meal-query").value = button.dataset.query; }));
document.querySelectorAll(".browse-chip").forEach(button => button.addEventListener("click", () => {
  const isLocation = Boolean(button.dataset.location);
  const value = isLocation ? button.dataset.location : button.dataset.mealType;
  const wasSelected = isLocation ? state.location === value : state.mealType === value;
  state.suggestionMode = false;
  if (isLocation) state.location = wasSelected ? "" : value;
  else state.mealType = wasSelected ? "" : value;
  syncControls(); updateBrowseButtons(); render();
}));
$("#suggest-next").addEventListener("click", () => { state.query = ""; $("#meal-query").value = ""; state.suggestionMode = true; render(); document.querySelector("#best-match").scrollIntoView({ behavior: "smooth", block: "center" }); });
$("#close-meal-detail").addEventListener("click", () => $("#meal-detail-dialog").close());
$("#coverage-note").textContent = `Dataset last updated: ${[...new Set(window.MEALS.map(meal => meal.verifiedAt))].join(", ")}.`;
render();
