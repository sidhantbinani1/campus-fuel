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
    location: context.location || "",
    mealType: context.mealType || "",
    remaining: { calories: context.remaining?.calories ?? null, protein: context.remaining?.protein ?? null },
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

/**
 * A provider for the meal assistant (see mountMealAssistant). Signed-in
 * students get the AI answer. Guests, and any failure at all (not deployed,
 * daily limit reached, offline), get the built-in rule-based search instead,
 * so the assistant never stops working.
 */
export function createMealProvider({ canAsk, ask, fallback }) {
  return async (request) => {
    if (!canAsk()) return fallback(request);
    try {
      const answer = await ask(request.message, request.context || {});
      if (!answer?.reply) return fallback(request);
      return { text: answer.reply, mealIds: answer.mealIds };
    } catch {
      return fallback(request);
    }
  };
}
