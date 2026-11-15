// Signed-in meal chat. The OpenAI key lives only in this function's secrets
// (OPENAI_API_KEY); the browser never sees it.
//
// Flow: check the student's session, load their campus menu, spend one of
// their daily messages, ask the model to choose from that menu, then return
// only ids that really exist on it.
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildMessages, cleanContext, cleanMessage, narrowRows, parseReply, shortlistRows } from "./core.js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
// Public (browser-safe) project key. Newer projects expose SUPABASE_PUBLISHABLE_KEYS;
// older ones only SUPABASE_ANON_KEY.
function publicKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
    const first = Object.values(keys).find((value) => typeof value === "string");
    if (first) return first as string;
  } catch { /* fall back below */ }
  return Deno.env.get("SUPABASE_ANON_KEY") ?? "";
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) return json({ error: "The meal chat is not set up yet." }, 503);

  // Every database call below runs as the student, so row-level security applies.
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, publicKey(), {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return json({ error: "Sign in to use the meal chat." }, 401);

  let message = "";
  let context = cleanContext();
  try {
    const body = await req.json();
    message = cleanMessage(body?.message);
    context = cleanContext(body);
  } catch { /* handled below */ }
  if (!message) return json({ error: "Type what you are looking for first." }, 400);

  const { data: profile } = await supabase.from("profiles").select("school").eq("user_id", auth.user.id).maybeSingle();
  if (!profile) return json({ error: "Finish setting up your account first." }, 403);

  // Every restaurant, unless the student narrowed to one restaurant or type.
  const { data: allRows, error: menuError } = await supabase.from("meal_catalog").select("id,snapshot").eq("school_id", profile.school);
  if (menuError) return json({ error: "The menu could not be loaded. Please try again." }, 500);
  if (!allRows?.length) return json({ error: "Menus for your campus are coming soon." }, 404);
  const rows = narrowRows(allRows, context);
  // Nothing matches their pick: answer for free instead of calling OpenAI.
  if (!rows.length) return json({ reply: "Nothing on the listed menu matches the restaurant and type you picked. Try clearing one and ask again.", mealIds: [], remaining: null });

  // Send the model the best ~40 matches, not the whole menu: sharper answers and
  // about 85% fewer input tokens per message.
  const shortlist = shortlistRows(rows, message, context);

  // Spend the allowance before calling OpenAI so a failure can never be retried for free.
  const { data: remaining, error: limitError } = await supabase.rpc("use_meal_chat");
  if (limitError) {
    const limited = /limit/i.test(limitError.message);
    return json(
      { error: limited ? "You have used today's 20 chat messages. Try again tomorrow." : "The meal chat is unavailable right now." },
      limited ? 429 : 500,
    );
  }

  let content = "";
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini",
        messages: buildMessages(message, shortlist, context, rows.length),
        response_format: { type: "json_object" },
        max_completion_tokens: 700,
        temperature: 0.4,
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) {
      console.error("OpenAI error", res.status, await res.text());
      return json({ error: "The meal chat is unavailable right now. Please try again." }, 502);
    }
    content = (await res.json())?.choices?.[0]?.message?.content ?? "";
  } catch (error) {
    console.error("OpenAI request failed", error);
    return json({ error: "The meal chat took too long. Please try again." }, 504);
  }

  return json({ ...parseReply(content, new Set(shortlist.map((row) => row.id))), remaining });
});
