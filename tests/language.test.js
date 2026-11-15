import { test } from "node:test";
import assert from "node:assert/strict";
import { fixRequest } from "../supabase/functions/meal-chat/language.js";

test("typos, abbreviations and slang are read as plain words", () => {
  const cases = {
    "hihgest calroies": "highest calories",
    "most protien": "most protein",
    "most calorys": "most calories",
    "lowst sodiom": "lowest sodium",
    "max kcal": "max calories",
    "what has the most pro": "what has the most protein",
    "hi protein": "high protein",
    "gf options": "gluten free options",
    "veggie stuff": "vegetarian stuff",
    "cfa nuggets": "chick-fil-a nuggets",
    "chikfila": "chick-fil-a",
    "pnada": "panda",
    "pom n honey": "pom & honey",
    "anything but chicken pls": "something not chicken pls",
    "nothing with chickn": "no chicken",
    "a ton of protein": "lots of protein",
    "post lift meal": "post lift high protein meal",
  };
  for (const [typed, meant] of Object.entries(cases)) assert.equal(fixRequest(typed), meant, typed);
});

test("ordinary sentences are left alone", () => {
  for (const text of ["which salad is the healthiest", "show me sandwiches", "except mondays i eat light", "i want lunch near the library", "is the pro bowl good", "the chicken was mid", "coffee and a bagel"]) {
    assert.equal(fixRequest(text), text, text);
  }
});
