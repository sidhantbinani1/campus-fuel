import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
test("database enforces isolation, opt-in access, aggregation thresholds, atomic sync and deletion", async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`,
  );
  await db.exec(
    readFileSync(
      new URL(
        "../supabase/migrations/202611140001_accounts.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      new URL(
        "../supabase/migrations/202611140002_catalog.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const meal = (await db.query("select id from public.meal_catalog limit 1"))
    .rows[0].id;
  const ids = Array.from(
    { length: 6 },
    (_, i) => `00000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`,
  );
  const as = async (id) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      id || "",
    ]);
    await db.exec("set role authenticated");
  };
  const profile = async (participating = true, visible = false) =>
    db.query(
      "select public.save_fuel_profile('cal-poly-slo','Student', $1,$2,'2026-11-14')",
      [participating, visible],
    );
  const save = async (revision, entries, favorites = []) =>
    db.query("select public.save_fuel_state($1,$2,$3,$4,$5) revision", [
      revision,
      JSON.stringify({ calories: 2000 }),
      JSON.stringify({}),
      JSON.stringify(entries),
      JSON.stringify(favorites),
    ]);
  const today = (
    await db.query(
      "select (now() at time zone 'America/Los_Angeles')::date::text d",
    )
  ).rows[0].d;
  for (const id of ids) {
    await db.query("insert into auth.users(id) values($1)", [id]);
  }
  await as(ids[0]);
  await profile(true, true);
  const row = {
    entry_id: "meal-one",
    meal_id: meal,
    school_id: "cal-poly-slo",
    logged_on: today,
    servings: 1,
  };
  await save(0, [row]);
  await assert.rejects(save(0, []), /Revision conflict/);
  await assert.rejects(
    db.query("update public.profiles set participating=false"),
    /permission denied/,
  );
  await as(ids[1]);
  assert.equal(
    (await db.query("select * from public.meal_logs")).rows.length,
    0,
  );
  await assert.rejects(
    db.query("select public.fuel_board('day')"),
    /participation/,
  );
  await profile();
  for (let i = 1; i < 5; i++) {
    await as(ids[i]);
    await profile();
    await save(0, [row, { ...row, entry_id: "repeat" }]);
  }
  await as(ids[0]);
  let board = (await db.query("select public.fuel_board('day') b")).rows[0].b;
  assert.equal(board.meals.length, 1);
  assert.equal(board.meals[0].eaters, 5);
  assert.deepEqual(board.meals[0].nicknames, ["Student"]);
  assert.equal(board.locations[0].students, 5);
  await as(ids[4]);
  await profile(false);
  await assert.rejects(
    db.query("select public.fuel_board('day')"),
    /participation/,
  );
  await as(ids[0]);
  board = (await db.query("select public.fuel_board('day') b")).rows[0].b;
  assert.equal(board.meals.length, 0);
  assert.equal(board.locations.length, 0);
  await assert.rejects(
    save(1, [{ ...row, school_id: "csu-bakersfield" }]),
    /Unknown campus meal/,
  );
  assert.equal(
    (await db.query("select revision from public.fuel_states")).rows[0]
      .revision,
    1,
  );
  await save(1, []);
  assert.equal(
    (await db.query("select * from public.meal_logs")).rows.length,
    0,
  );
  await db.query("select public.delete_fuel_account()");
  await db.exec("reset role");
  assert.equal(
    (await db.query("select * from auth.users where id=$1", [ids[0]])).rows
      .length,
    0,
  );
  assert.equal(
    (await db.query("select * from public.profiles where user_id=$1", [ids[0]]))
      .rows.length,
    0,
  );
  await db.exec("set role anon");
  await assert.rejects(
    db.query("select public.fuel_board('day')"),
    /permission denied/,
  );
  await db.close();
});
