import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { askMealChat, createMealProvider } from "../src/meal-chat.js";
import {
  buildMessages,
  cleanContext,
  cleanMessage,
  filterRows,
  FALLBACK_REPLY,
  menuLine,
  parseReply,
} from "../supabase/functions/meal-chat/core.js";

test("meal chat prompt lists only real menu facts and keeps unknowns unknown", () => {
  assert.equal(cleanMessage("  high   protein\n lunch "), "high protein lunch");
  assert.equal(cleanMessage("x".repeat(900)).length, 300);
  assert.equal(cleanMessage({ nope: true }), "");
  const line = menuLine("abc", { name: "Fruit Cup", location: "Chick-fil-A", mealType: "snack", calories: 60, proteinGrams: 1, carbsGrams: 15, fatGrams: null, vegetarian: null });
  assert.equal(line, "abc | Fruit Cup | Chick-fil-A | snack | 60 cal | 1g protein | 15g carbs | unknown g fat");
  assert.doesNotMatch(line, /vegetarian/);
  const messages = buildMessages("something light", [{ id: "abc", snapshot: { name: "Fruit Cup" } }]);
  assert.equal(messages[0].role, "system");
  assert.match(messages[1].content, /MENU\nabc \| Fruit Cup/);
  assert.match(messages[1].content, /STUDENT REQUEST\nsomething light$/);
  assert.doesNotMatch(messages[1].content, /LEFT TODAY/);
});

test("meal chat honours the student's filters and what they have left today", () => {
  const rows = [
    { id: "a", snapshot: { name: "Bowl", location: "Panda Express", mealType: "meal" } },
    { id: "b", snapshot: { name: "Cup", location: "Chick-fil-A", mealType: "snack" } },
  ];
  assert.deepEqual(filterRows(rows, cleanContext({ location: "Panda Express" })).map((r) => r.id), ["a"]);
  assert.deepEqual(filterRows(rows, cleanContext({ mealType: "snack" })).map((r) => r.id), ["b"]);
  assert.deepEqual(filterRows(rows, cleanContext({ location: "Panda Express", mealType: "snack" })), []);
  assert.equal(filterRows(rows, cleanContext()).length, 2);
  const junk = cleanContext({ location: { $ne: 1 }, mealType: 9, remaining: { calories: "abc", protein: 1e99 } });
  assert.deepEqual(junk, { location: "", mealType: "", remaining: { calories: null, protein: 20000 } });
  const left = buildMessages("lunch", rows, cleanContext({ remaining: { calories: 812.4, protein: null } }));
  assert.match(left[1].content, /LEFT TODAY\n812 calories\n\nSTUDENT REQUEST\nlunch$/);
});

test("meal chat drops invented meals and survives a broken model reply", () => {
  const valid = new Set(["a", "b", "c", "d", "e", "f"]);
  assert.deepEqual(
    parseReply(JSON.stringify({ reply: " Try these. ", meal_ids: ["a", "made-up", "a", 7, "b"] }), valid),
    { reply: "Try these.", mealIds: ["a", "b"] },
  );
  assert.equal(parseReply(JSON.stringify({ reply: "x", meal_ids: ["a", "b", "c", "d", "e", "f"] }), valid).mealIds.length, 5);
  assert.deepEqual(parseReply("not json at all", valid), { reply: FALLBACK_REPLY, mealIds: [] });
  assert.deepEqual(parseReply(JSON.stringify({ meal_ids: "a" }), valid), { reply: FALLBACK_REPLY, mealIds: [] });
});

test("browser chat client sends the message and reports server errors plainly", async () => {
  const calls = [];
  const client = {
    functions: {
      async invoke(name, options) {
        calls.push([name, options]);
        return { data: { reply: "Here you go.", mealIds: ["a", 3, "b"], remaining: 19 }, error: null };
      },
    },
  };
  assert.deepEqual(await askMealChat(client, "  lots of   protein "), { reply: "Here you go.", mealIds: ["a", "b"], remaining: 19 });
  assert.deepEqual(calls, [["meal-chat", { body: { message: "lots of protein", location: "", mealType: "", remaining: { calories: null, protein: null } } }]]);
  await assert.rejects(askMealChat(client, "   "), /Type what you are looking for/);
  assert.equal(calls.length, 1, "an empty message never reaches the server");
  await assert.rejects(askMealChat(null, "hi"), /accounts to be configured/);
  const limited = { functions: { invoke: async () => ({ data: null, error: { context: { json: async () => ({ error: "You have used today's 20 chat messages. Try again tomorrow." }) } } }) } };
  await assert.rejects(askMealChat(limited, "hi"), /used today's 20 chat messages/);
  const broken = { functions: { invoke: async () => ({ data: null, error: { context: { json: async () => { throw new Error("no body"); } } } }) } };
  await assert.rejects(askMealChat(broken, "hi"), /unavailable right now/);
});

test("assistant uses AI only when signed in and falls back to the rule-based search on any failure", async () => {
  const rules = async (request) => ({ text: "rules: " + request.message, mealIds: ["r"] });
  const request = { message: "lunch", context: { location: "Panda Express", mealType: "", remaining: { calories: 500, protein: null } } };
  const asked = [];
  const ai = async (message, context) => { asked.push([message, context]); return { reply: "AI pick", mealIds: ["a"], remaining: 19 }; };

  const guest = createMealProvider({ canAsk: () => false, ask: ai, fallback: rules });
  assert.deepEqual(await guest(request), { text: "rules: lunch", mealIds: ["r"] });
  assert.equal(asked.length, 0, "guests never reach the paid service");

  const student = createMealProvider({ canAsk: () => true, ask: ai, fallback: rules });
  assert.deepEqual(await student(request), { text: "AI pick", mealIds: ["a"] });
  assert.deepEqual(asked, [["lunch", request.context]]);

  const limited = createMealProvider({ canAsk: () => true, ask: async () => { throw new Error("limit"); }, fallback: rules });
  assert.deepEqual(await limited(request), { text: "rules: lunch", mealIds: ["r"] });
  const empty = createMealProvider({ canAsk: () => true, ask: async () => ({ reply: "", mealIds: [] }), fallback: rules });
  assert.deepEqual(await empty(request), { text: "rules: lunch", mealIds: ["r"] });
});

test("database caps each student at 20 chat messages a day", async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`,
  );
  for (const file of ["20261114203831_campus_fuel_accounts.sql", "20261115020000_meal_chat.sql"])
    await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
  const [one, two] = ["00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002"];
  for (const id of [one, two]) await db.query("insert into auth.users(id) values($1)", [id]);
  const as = async (id) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || ""]);
    await db.exec("set role authenticated");
  };
  const use = async () => (await db.query("select public.use_meal_chat() left_today")).rows[0].left_today;

  await as(one);
  assert.equal(await use(), 19);
  for (let i = 0; i < 18; i++) await use();
  assert.equal(await use(), 0);
  await assert.rejects(use(), /Daily chat limit reached/);
  await assert.rejects(use(), /Daily chat limit reached/);
  await assert.rejects(db.query("select * from public.meal_chat_usage"), /permission denied/);
  await assert.rejects(db.query("update public.meal_chat_usage set messages=0"), /permission denied/);

  await as(two);
  assert.equal(await use(), 19, "one student's usage never touches another's");

  await as("");
  await assert.rejects(use(), /Sign in required/);

  await db.exec("reset role");
  assert.deepEqual(
    (await db.query("select messages from public.meal_chat_usage order by user_id")).rows.map((r) => r.messages),
    [20, 1],
  );
});
