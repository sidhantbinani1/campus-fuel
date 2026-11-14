import { test } from "node:test";
import assert from "node:assert/strict";
import { series, mergeGuest, escapeHtml, SCHOOLS } from "../src/model.js";
test("nutrition graphs distinguish missing days and missing nutrients, scale servings, include year boundary", () => {
  const rows = series(
    [
      { date: "2025-12-31", snapshot: { calories: 400 }, servings: 2 },
      { date: "2026-01-01", snapshot: { calories: null } },
    ],
    "week",
    "calories",
    new Date("2026-01-02T12:00:00"),
  );
  assert.equal(rows.length, 7);
  assert.equal(rows.find((r) => r.date === "2025-12-31").value, 800);
  assert.equal(rows.find((r) => r.date === "2026-01-01").complete, false);
  assert.equal(rows.at(-1).tracked, false);
});
test("year graphs include 365 calendar days across daylight savings", () => {
  assert.equal(
    series([], "year", "calories", new Date("2026-11-14T12:00:00")).length,
    365,
  );
});
test("guest import is idempotent and retains server historical goals", () => {
  const current = {
      entries: [{ entryId: "a" }],
      goals: {},
      dailyGoals: { x: { calories: 2 } },
    },
    guest = {
      entries: [{ entryId: "a" }, { entryId: "b" }],
      goals: { calories: 1000 },
      dailyGoals: { x: { calories: 1 } },
    };
  const result = mergeGuest(current, guest);
  assert.equal(result.entries.length, 2);
  assert.equal(mergeGuest(result, guest).entries.length, 2);
  assert.equal(result.dailyGoals.x.calories, 2);
});
test("public names are escaped; schools have unique IDs and only SLO menus", () => {
  assert.equal(
    escapeHtml('<img onerror="x">'),
    "&lt;img onerror=&quot;x&quot;&gt;",
  );
  assert.equal(new Set(SCHOOLS.map((s) => s.id)).size, SCHOOLS.length);
  assert.deepEqual(
    SCHOOLS.filter((s) => s.menus).map((s) => s.id),
    ["cal-poly-slo"],
  );
});

test("partial nutrition contributes its known subtotal without marking the day complete", () => {
  const result = series(
    [
      {
        date: "2026-11-14",
        snapshot: { calories: null, partialNutrition: { calories: 250 } },
        servings: 2,
      },
    ],
    "day",
    "calories",
    new Date("2026-11-14T12:00:00"),
  );
  assert.equal(result[0].value, 500);
  assert.equal(result[0].complete, false);
});
