// Reads a student's message the way they meant it: typos, abbreviations and
// gym or campus slang are rewritten into plain words before any matching.
// Plain JavaScript shared by the browser rule search (src/meal-assistant.js)
// and the meal-chat Edge Function, so both read a message the same way.
//
// The student's original words are never thrown away: callers parse the fixed
// text and still show or send the original.

// Whole phrases first. Each pattern runs on lowercased text.
const PHRASES = [
  // Restaurants
  [/\bc\.?f\.?a\b/g, "chick-fil-a"],
  [/\bchi(?:c)?k\s*-?\s*f(?:i|e)?l\s*-?\s*a\b|\bchikfila\b|\bchickfila\b|\bchick fila\b/g, "chick-fil-a"],
  [/\bpom\s*(?:n|and|'n'?|&)\s*honey\b/g, "pom & honey"],
  [/\bjulians\b|\bjulian s\b/g, "julian's"],
  [/\bpoly\s+choice\b/g, "polychoice"],
  [/\bred\s+rad+ish\b/g, "red radish"],
  // "anything but chicken", "everything except beef" mean "not chicken"
  [/\b(?:anything|everything|something|whatever)\s+(?:but|except(?:\s+for)?)\b/g, "something not"],
  [/\bnothing\s+(?:with|that has|containing)\b/g, "no"],
  [/\b(?:a ton of|tons of|loads of|a bunch of|mad)\b(?=\s+(?:protein|calories|fiber))/g, "lots of"],
  // Nutrient shorthand
  [/\bk?cal[sz]?\b/g, "calories"],
  [/\bprots?\b|\bprotien\b|\bprotine\b|\bprotin\b/g, "protein"],
  [/\b(most|highest|high|hi|more|max|lots of|a lot of|least|lowest|low)\s+pro\b/g, "$1 protein"],
  [/\bhi\b(?=\s+(?:protein|calories?|fiber|carbs?))/g, "high"],
  [/\blo\b(?=\s+(?:calories?|carbs?|sodium|sugar|fat))/g, "low"],
  [/\bgf\b/g, "gluten free"],
  [/\bveg(?:gie)?\s+(options?|food|stuff|meals?|only)\b/g, "vegetarian $1"],
  // Gym talk
  [/\b(?:gains|swole|post\s*-?\s*(?:lift|workout|gym)|after\s+(?:the\s+)?(?:gym|lift(?:ing)?|workout))\b/g, "$& high protein"],
];

// Words worth spell-correcting. Only these are ever changed, so ordinary
// words are left alone.
const VOCABULARY = [
  "calories", "calorie", "protein", "highest", "lowest", "biggest", "smallest", "fewest",
  "sodium", "sugar", "fiber", "carbs", "cholesterol", "saturated",
  "chicken", "nuggets", "vegetarian", "vegan", "gluten", "breakfast", "filling", "healthy", "healthier",
  "salad", "sandwich", "burrito", "noodles", "vegetables", "dessert", "smoothie", "shrimp", "tofu",
  "healthiest", "panda", "express", "radish", "honey", "polychoice",
];

/** Edit distance where a swapped pair of letters counts once ("protien"). */
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Closest vocabulary word, or the word itself when nothing is close enough. */
export function correctWord(word) {
  if (word.length < 5 || VOCABULARY.includes(word)) return word;
  // Plurals and other endings on a known word ("sandwiches") are not typos.
  if (VOCABULARY.some((known) => word.startsWith(known))) return word;
  const allowed = word.length >= 7 ? 2 : 1;
  let best = word;
  let bestDistance = allowed + 1;
  for (const candidate of VOCABULARY) {
    if (Math.abs(candidate.length - word.length) > allowed) continue;
    // Keep the first letter: real typos rarely change it, and this stops
    // "lunch" from turning into "punch"-style mistakes.
    if (candidate[0] !== word[0]) continue;
    const d = distance(word, candidate);
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return best;
}

/** The message rewritten in plain words, lowercased, for matching only. */
export function fixRequest(message) {
  let text = String(message || "").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
  text = text.replace(/[a-z]+/g, (word) => correctWord(word));
  for (const [pattern, replacement] of PHRASES) text = text.replace(pattern, replacement);
  return text.replace(/\s+/g, " ").trim();
}
