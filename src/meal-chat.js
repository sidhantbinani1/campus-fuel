// Browser side of the AI meal chat. It only talks to our own Supabase function;
// the OpenAI key never reaches this file.
export const MAX_CHAT_MESSAGE = 300;
const UNAVAILABLE = "The meal chat is unavailable right now. Please try again.";

export async function askMealChat(client, message, context = {}) {
  const text = String(message ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_CHAT_MESSAGE);
  if (!text) throw new Error("Type what you are looking for first.");
  if (!client) throw new Error("The meal chat needs accounts to be configured.");
  const body = {
    message: text,
    goals: context.goals || {},
    remaining: { calories: context.remaining?.calories ?? null, protein: context.remaining?.protein ?? null },
    eatenToday: Array.isArray(context.eatenToday) ? context.eatenToday : [],
    eatenTotals: context.eatenTotals || {},
    hint: Array.isArray(context.hint) ? context.hint : [],
    history: Array.isArray(context.history) ? context.history : [],
    localHour: new Date().getHours(),
  };
  const { data, error } = await client.functions.invoke("meal-chat", { body });
  if (error) {
    let detail = "";
    try {
      detail = (await error.context?.json())?.error;
    } catch { /* fall back to the generic message */ }
    throw new Error(typeof detail === "string" && detail ? detail : UNAVAILABLE);
  }
  return {
    reply: typeof data?.reply === "string" ? data.reply : "",
    mealIds: Array.isArray(data?.mealIds) ? data.mealIds.filter((id) => typeof id === "string").slice(0, 5) : [],
    remaining: Number.isInteger(data?.remaining) ? data.remaining : null,
  };
}

// Questions that want judgement, not just a filtered list. These go to the AI
// even when the rules found matches.
const ADVICE = /\b(why|how (?:much|many|do|does|should|can|about)|should i|which (?:is|one)|is (?:it|this|that|the)\b.*\b(?:good|healthy|better|worth|enough)|better|best|compare|vs\.?|versus|worth|advice|tips?|explain|help me (?:decide|choose|pick)|bulk(?:ing)?|cut(?:ting)?|lose weight|losing weight|gain(?:ing)? (?:weight|muscle)|muscle|recover(?:y)?|workout|gym|lift(?:ing)?|practice|training|game day|before (?:class|my|a)|after (?:class|my|a)|exam|study|tired|energy|sick|hangover|full (?:until|for)|stay full|budget|cheap)\b/i;

/** True when the rule-based answer is good enough to show without the AI. */
export function rulesAnswered(result, message) {
  if (ADVICE.test(String(message || ""))) return false;
  if (["no-menu", "policy", "plan-needed"].includes(result?.reason)) return true;
  return result?.reason === "matched" && Array.isArray(result.mealIds) && result.mealIds.length > 0;
}

/**
 * Provider for the meal assistant (see mountMealAssistant).
 * 1. The built-in rules answer first. They are free and cover simple requests
 *    ("something filling, not chicken", "under 700 calories", a restaurant).
 * 2. Only when the rules cannot answer, or the student asks for advice, a
 *    signed-in student's message goes to the AI with their plan as context.
 * 3. Any AI failure (offline, daily limit, not deployed) shows the rules answer.
 * The AI sees the last few turns only to understand words like "that one";
 * every message is still read fresh across all restaurants.
 */
export function createMealProvider({ canAsk, ask, fallback }) {
  let history = [];
  const remember = (role, text) => {
    history = [...history, { role, text: String(text || "").slice(0, 300) }].slice(-6);
  };
  const provider = async (request) => {
    const rules = await fallback(request);
    if (rulesAnswered(rules, request.message) || !canAsk()) {
      remember("user", request.message);
      remember("assistant", rules.text);
      return rules;
    }
    try {
      const answer = await ask(request.message, {
        ...(request.context || {}),
        hint: rules.mealIds || [],
        history,
      });
      if (!answer?.reply) throw new Error("empty");
      remember("user", request.message);
      remember("assistant", answer.reply);
      return { text: answer.reply, mealIds: answer.mealIds.length ? answer.mealIds : rules.mealIds || [], source: "ai" };
    } catch {
      remember("user", request.message);
      remember("assistant", rules.text);
      return rules;
    }
  };
  provider.reset = () => { history = []; };
  return provider;
}
