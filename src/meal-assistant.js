const groups = {
  chicken: ['chicken', 'nugget', 'nuggets', 'chick-fil-a', 'chickfila'],
  beef: ['beef', 'steak', 'burger'],
  pork: ['pork', 'bacon', 'ham'],
  fish: ['fish', 'salmon', 'tuna', 'shrimp'],
  tofu: ['tofu', 'plant based'],
  vegetables: ['vegetable', 'veggie', 'broccoli', 'kale', 'salad', 'greens']
};

const locations = {
  'Panda Express': ['panda', 'panda express'],
  'Chick-fil-A': ['chick-fil-a', 'chick fil a', 'chickfila', 'cfa'],
  'Red Radish': ['red radish', 'radish']
};

const nutrients = [
  {key: 'calories', words: ['calorie', 'calories', 'cal'], unit: 'cal'},
  {key: 'proteinGrams', words: ['protein'], unit: 'g'},
  {key: 'carbsGrams', words: ['carb', 'carbs', 'carbohydrate', 'carbohydrates'], unit: 'g'},
  {key: 'fatGrams', words: ['fat'], unit: 'g'},
  {key: 'fiberGrams', words: ['fiber', 'fibre'], unit: 'g'},
  {key: 'sugarGrams', words: ['sugar'], unit: 'g'},
  {key: 'saturatedFatGrams', words: ['saturated fat'], unit: 'g'},
  {key: 'transFatGrams', words: ['trans fat'], unit: 'g'},
  {key: 'sodiumMilligrams', words: ['sodium'], unit: 'mg'},
  {key: 'cholesterolMilligrams', words: ['cholesterol'], unit: 'mg'},
  {key: 'potassiumMilligrams', words: ['potassium'], unit: 'mg'},
  {key: 'calciumMilligrams', words: ['calcium'], unit: 'mg'},
  {key: 'ironMilligrams', words: ['iron'], unit: 'mg'},
  {key: 'vitaminCMilligrams', words: ['vitamin c'], unit: 'mg'},
  {key: 'vitaminARe', words: ['vitamin a'], unit: 're'},
  {key: 'vitaminDIu', words: ['vitamin d'], unit: 'iu'}
];

const normalize = value => String(value || '').toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
const recordText = meal => normalize([
  meal.name, meal.description, meal.location, meal.category, meal.type,
  ...(meal.components || []).flatMap(component => [component.name, component.description])
].filter(Boolean).join(' '));
const mealValue = (meal, key) => meal[key] !== null && meal[key] !== '' && meal[key] !== undefined && Number.isFinite(Number(meal[key])) ? Number(meal[key]) : null;
const numberWord = value => ({one: 1, two: 2, three: 3, four: 4}[value] || Number(value) || null);

function isCompleteMeal(meal) {
  return meal.mealType === 'meal'
    || meal.isMealIdea
    || (meal.location === 'Red Radish' && meal.category === 'Salad' && /salad/i.test(meal.name) && /bowl|plate|serving/i.test(meal.servingSize || ''));
}

function groupsIn(text) {
  return Object.entries(groups).filter(([, words]) => words.some(word => text.includes(word))).map(([key]) => key);
}

function locationIn(text) {
  return Object.entries(locations).find(([, aliases]) => aliases.some(alias => text.includes(alias)))?.[0] || null;
}

function hasNegativeBefore(text, word) {
  const escaped = word.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
  return new RegExp('(no|not|without|avoid|instead of|less|change from|other than)\\s+(?:more\\s+)?' + escaped, 'i').test(text)
    || new RegExp('(?:tired of|too much)\\s+' + escaped, 'i').test(text)
    || new RegExp(escaped + '[^.!?]{0,45}(?:too much|too often|again|something else)', 'i').test(text);
}

function parseLimits(text) {
  const results = [];
  for (const nutrient of nutrients) {
    const label = nutrient.words.slice().sort((a, b) => b.length - a.length).map(word => word.replace(/[.*+?^$()|[\]\\]/g, '\\$&')).join('|');
    const before = new RegExp('(under|below|less than|at most|no more than|up to)\\s*(\\d+(?:\\.\\d+)?)\\s*(g|mg|cal)?\\s*(?:of\\s*)?(?:' + label + ')\\b', 'ig');
    const after = new RegExp('(?:' + label + ')\\s*(?:under|below|less than|at most|no more than|up to)\\s*(\\d+(?:\\.\\d+)?)\\s*(g|mg|cal)?', 'ig');
    const atLeast = new RegExp('(at least|more than|over|minimum of)\\s*(\\d+(?:\\.\\d+)?)\\s*(g|mg|cal)?\\s*(?:of\\s*)?(?:' + label + ')\\b', 'ig');
    for (const match of text.matchAll(before)) results.push({key: nutrient.key, type: 'max', value: convertLimit(match[2], match[3], nutrient)});
    for (const match of text.matchAll(after)) results.push({key: nutrient.key, type: 'max', value: convertLimit(match[1], match[2], nutrient)});
    for (const match of text.matchAll(atLeast)) results.push({key: nutrient.key, type: 'min', value: convertLimit(match[2], match[3], nutrient)});
  }
  return results.filter(limit => Number.isFinite(limit.value));
}

function convertLimit(value, statedUnit, nutrient) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (nutrient.unit === 'mg' && normalize(statedUnit) === 'g') return number * 1000;
  return number;
}

function getConstraints(message, history) {
  const turns = [...history.filter(turn => turn.role === 'user').slice(-4).map(turn => turn.text), message];
  const fullText = normalize(turns.join(' '));
  const excluded = new Set();
  const included = new Set();
  for (const group of groupsIn(fullText)) {
    if (hasNegativeBefore(fullText, group)) excluded.add(group);
    else if (group !== 'vegetables') included.add(group);
  }
  const directLocation = locationIn(normalize(message));
  const rememberedLocation = locationIn(fullText);
  const wantsVegetables = /\b(vegetable|vegetables|veggie|veggies|greens|salad|produce)\b/.test(fullText);
  const snack = /\b(snack|quick bite|small bite)\b/.test(fullText);
  const breakfast = /\b(breakfast|morning)\b/.test(fullText);
  const filling = /\b(filling|full meal|hungry|hearty|substantial)\b/.test(fullText);
  const light = /\b(light|lighter)\b/.test(fullText);
  const healthy = /\b(healthy|healthier|balanced|nutritious|nourishing|good for me)\b/.test(fullText);
  const mealsLeftMatch = fullText.match(/\b(\d+|one|two|three|four)\s+(?:more\s+)?(?:meals?|times?)\b/);
  const mealsLeft = mealsLeftMatch ? numberWord(mealsLeftMatch[1]) : null;
  const alternatives = /\b(alternative|another|something else|different|change it up)\b/.test(normalize(message));
  const usePlan = /\b(my plan|what.*left|remaining|fit.*today|fit.*plan|today.?s goal|goals?)\b/.test(normalize(message));
  return {
    fullText, excluded, included, location: directLocation || rememberedLocation, wantsVegetables,
    snack, breakfast, filling, light, healthy, mealsLeft, alternatives, usePlan,
    completeMeal: !snack && (filling || healthy || Boolean(mealsLeft) || usePlan),
    limits: parseLimits(fullText)
  };
}

function matchesIntent(meal, constraints, context) {
  const text = recordText(meal);
  if (constraints.location && normalize(meal.location) !== normalize(constraints.location) && !text.includes(normalize(constraints.location))) return false;
  if (constraints.completeMeal && !isCompleteMeal(meal)) return false;
  const remainingCalories = Number(context?.remaining?.calories);
  const calories = mealValue(meal, 'calories');
  if (constraints.mealsLeft && Number.isFinite(remainingCalories) && calories !== null) {
    const mealTarget = remainingCalories / constraints.mealsLeft;
    if (calories < Math.min(450, mealTarget * 0.35)) return false;
  }
  for (const group of constraints.excluded) if (groups[group].some(word => text.includes(word))) return false;
  for (const group of constraints.included) if (!groups[group].some(word => text.includes(word))) return false;
  if (constraints.wantsVegetables && !groups.vegetables.some(word => text.includes(word))) return false;
  for (const limit of constraints.limits) {
    const value = mealValue(meal, limit.key);
    if (value === null || (limit.type === 'max' && value > limit.value) || (limit.type === 'min' && value < limit.value)) return false;
  }
  return true;
}

function scoreMeal(meal, constraints, context) {
  const text = recordText(meal);
  let score = 0;
  if (isCompleteMeal(meal)) score += 28;
  if (constraints.wantsVegetables && groups.vegetables.some(word => text.includes(word))) score += 16;
  for (const group of constraints.included) if (groups[group].some(word => text.includes(word))) score += 10;
  if (constraints.snack && /\b(snack|fruit|cup|bar|yogurt|cookie)\b/.test(text)) score += 12;
  if (constraints.breakfast && /\b(breakfast|biscuit|egg|oatmeal|coffee)\b/.test(text)) score += 12;
  const calories = mealValue(meal, 'calories');
  const protein = mealValue(meal, 'proteinGrams');
  if (constraints.filling && calories !== null) score += Math.min(calories, 950) / 75;
  if (constraints.light && calories !== null) score += Math.max(0, 700 - calories) / 55;
  if (constraints.healthy) {
    if (groups.vegetables.some(word => text.includes(word))) score += 16;
    if (protein !== null) score += Math.min(protein, 45) / 2;
    if (calories !== null && calories < 150) score -= 20;
    if (/\b(grilled|fruit|greens|salad|kale|spinach)\b/.test(text)) score += 12;
    if (/\b(fries|waffle potato|fried|breaded|cookie|brownie|orange chicken)\b/.test(text)) score -= 45;
  }
  if (constraints.usePlan && context?.remaining) {
    const remainingCalories = Number(context.remaining.calories);
    const remainingProtein = Number(context.remaining.protein);
    if (Number.isFinite(remainingCalories) && calories !== null) {
      const mealTarget = constraints.mealsLeft
        ? remainingCalories / constraints.mealsLeft
        : Math.min(850, remainingCalories);
      score += calories <= remainingCalories ? 24 - Math.abs(calories - mealTarget) / 45 : -30;
      if (constraints.mealsLeft && calories < Math.min(450, mealTarget * 0.35)) score -= 60;
    }
    if (Number.isFinite(remainingProtein) && protein !== null) {
      score += protein <= remainingProtein ? 16 + protein / Math.max(remainingProtein, 1) * 9 : -20;
    }
  }
  return score;
}

function hasPlanRemaining(context) {
  return Number.isFinite(Number(context?.remaining?.calories)) || Number.isFinite(Number(context?.remaining?.protein));
}

function planPhrase(context) {
  const parts = [];
  const calories = Number(context?.remaining?.calories);
  const protein = Number(context?.remaining?.protein);
  if (Number.isFinite(calories)) parts.push(Math.max(0, Math.round(calories)) + ' calories left');
  if (Number.isFinite(protein)) parts.push(Math.max(0, Math.round(protein)) + 'g protein left');
  return parts.join(' and ');
}

function rememberedMealIds(history) {
  return new Set(history.filter(turn => turn.role === 'assistant' && Array.isArray(turn.mealIds)).flatMap(turn => turn.mealIds));
}

function chooseRecommendations(matches, constraints) {
  if (constraints.location || !(constraints.healthy || constraints.usePlan || constraints.filling)) return matches.slice(0, 3);
  const choices = [];
  const representedLocations = new Set();
  for (const meal of matches) {
    if (representedLocations.has(meal.location)) continue;
    choices.push(meal);
    representedLocations.add(meal.location);
    if (choices.length === 3) return choices;
  }
  for (const meal of matches) {
    if (choices.includes(meal)) continue;
    choices.push(meal);
    if (choices.length === 3) break;
  }
  return choices;
}

function describeConstraints(constraints, context) {
  const pieces = [];
  if (constraints.location) pieces.push(constraints.location);
  if (constraints.excluded.size) pieces.push('no ' + [...constraints.excluded].join(' or '));
  if (constraints.wantsVegetables) pieces.push('vegetable-forward');
  if (constraints.snack) pieces.push('a snack');
  if (constraints.breakfast) pieces.push('breakfast');
  if (constraints.filling) pieces.push('something filling');
  if (constraints.light) pieces.push('something lighter');
  if (constraints.healthy) pieces.push('healthier choices');
  if (constraints.mealsLeft) pieces.push(constraints.mealsLeft + ' meals still planned');
  if (constraints.usePlan && hasPlanRemaining(context)) pieces.push('what fits ' + planPhrase(context));
  return pieces;
}

export function findMenuMatches({message, history = [], catalog = [], context = {}}) {
  const cleanMessage = String(message || '').trim();
  if (!catalog.length) return {text: 'There are no menu records for this school yet, so I cannot safely recommend a meal.', mealIds: []};
  if (/\b(recommend|set|create|calculate)\b.*\b(daily|target|goal)\b|\bhow many calories should i\b/.test(normalize(cleanMessage))) {
    return {text: 'I can help you choose from the campus menu, but I do not set nutrition targets. Your saved plan stays in your control.', mealIds: []};
  }
  const constraints = getConstraints(cleanMessage, history);
  if (constraints.usePlan && !hasPlanRemaining(context)) {
    return {text: 'I can match meals to what is left today after you save a Daily Plan. Or tell me a preference like “vegetable-forward” or “under 700 calories.”', mealIds: []};
  }
  const hasIntent = constraints.location || constraints.excluded.size || constraints.included.size || constraints.wantsVegetables || constraints.snack || constraints.breakfast || constraints.filling || constraints.light || constraints.healthy || constraints.mealsLeft || constraints.usePlan || constraints.limits.length;
  if (!hasIntent) {
    return {text: 'Tell me what you want in plain language—try “something filling, not chicken,” “Panda with vegetables,” or “what fits what I have left today.” I will only use listed campus menu records.', mealIds: []};
  }
  const priorIds = rememberedMealIds(history);
  let matches = catalog.filter(meal => matchesIntent(meal, constraints, context));
  if (constraints.alternatives) {
    const fresh = matches.filter(meal => !priorIds.has(meal.id));
    if (fresh.length) matches = fresh;
  }
  matches = matches.sort((a, b) => scoreMeal(b, constraints, context) - scoreMeal(a, constraints, context) || String(a.name).localeCompare(String(b.name)));
  const mealIds = chooseRecommendations(matches, constraints).map(meal => meal.id);
  if (!mealIds.length) {
    const sought = describeConstraints(constraints, context);
    return {text: 'I could not find an exact listed match' + (sought.length ? ' for ' + sought.join(', ') : '') + '. I did not loosen your request. Try another restaurant, a wider calorie limit, or fewer constraints.', mealIds: []};
  }
  const heard = describeConstraints(constraints, context);
  const intro = heard.length ? 'I looked for ' + heard.join(', ') + '.' : 'Here are the closest listed campus options.';
  const planNote = constraints.usePlan && hasPlanRemaining(context) ? ' Ranked using ' + planPhrase(context) + '.' : '';
  return {text: intro + planNote + ' These are real menu records—open one for the full nutrition details.', mealIds};
}

export const menuProvider = async request => findMenuMatches(request);

export function mountMealAssistant(root, {getCatalog, getContext = () => ({}), openMeal, showSuggestions = () => {}, provider = menuProvider}) {
  const messages = root.querySelector('.assistant-messages');
  const form = root.querySelector('form');
  const input = root.querySelector('input');
  const resetButton = root.querySelector('.assistant-reset');
  const promptButtons = [...root.querySelectorAll('[data-meal-prompt]')];
  let history = [];
  let requestVersion = 0;

  function addMessage(role, text, mealIds = []) {
    const message = document.createElement('div');
    message.className = 'assistant-message assistant-' + role;
    const copy = document.createElement('p');
    copy.textContent = text;
    message.append(copy);
    messages.append(message);
    messages.scrollTop = messages.scrollHeight;
  }

  async function send(text) {
    const clean = String(text || '').trim();
    if (!clean) return;
    const version = ++requestVersion;
    addMessage('user', clean);
    history.push({role: 'user', text: clean});
    input.value = '';
    input.disabled = true;
    try {
      const response = await provider({message: clean, history, catalog: getCatalog(), context: getContext()});
      if (version !== requestVersion) return;
      const validIds = Array.isArray(response?.mealIds) ? response.mealIds.filter(id => getCatalog().some(meal => meal.id === id)) : [];
      const textResponse = String(response?.text || 'I could not complete that menu search. Please try again.');
      addMessage('assistant', textResponse, validIds);
      history.push({role: 'assistant', text: textResponse, mealIds: validIds});
      showSuggestions({text: textResponse, mealIds: validIds});
    } catch {
      if (version === requestVersion) {
        const textResponse = 'I could not search the menu just now. Please try again.';
        addMessage('assistant', textResponse);
        history.push({role: 'assistant', text: textResponse, mealIds: []});
        showSuggestions({text: textResponse, mealIds: []});
      }
    } finally {
      if (version === requestVersion) input.disabled = false;
    }
  }

  function reset() {
    requestVersion += 1;
    history = [];
    showSuggestions({text: '', mealIds: []});
    messages.replaceChildren();
    addMessage('assistant', 'What sounds good? I can use what you have left today, a restaurant, or preferences like “something filling, not chicken.”');
    input.value = '';
    input.disabled = false;
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    send(input.value);
  });
  promptButtons.forEach(button => button.addEventListener('click', () => send(button.dataset.mealPrompt)));
  resetButton?.addEventListener('click', reset);
  reset();
  return {reset, send};
}
