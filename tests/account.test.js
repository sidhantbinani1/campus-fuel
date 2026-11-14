import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { createAccount } from "../src/account.js";
test("account UI loads private state, onboards, charts, settings, gated rankings, and clears private data on signout", async () => {
  const dom = new JSDOM(
    readFileSync(new URL("../index.html", import.meta.url), "utf8"),
    { url: "http://localhost" },
  );
  for (const key of [
    "window",
    "document",
    "localStorage",
    "sessionStorage",
    "location",
  ])
    globalThis[key] = dom.window[key];
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  let authChange,
    profile = null,
    revision = 0;
  let snap = { goals: { calories: "2100" }, entries: [], dailyGoals: {} };
  const calls = [];
  const fake = {
    auth: {
      onAuthStateChange(fn) {
        authChange = fn;
      },
      async signOut() {
        authChange("SIGNED_OUT", null);
        return {};
      },
    },
    async rpc(name, args) {
      calls.push(name);
      if (name === "load_fuel_account")
        return {
          data: {
            profile,
            state: { revision, goals: { calories: "2000" }, daily_goals: {} },
            logs: [],
            favorites: [],
          },
        };
      if (name === "save_fuel_profile") {
        profile = {
          school: args.p_school,
          nickname: args.p_nickname,
          participating: args.p_participating,
          show_nickname: args.p_show_nickname,
          terms_version: args.p_terms_version,
        };
        return {};
      }
      if (name === "save_fuel_state") {
        assert.equal(args.expected_revision, revision);
        return { data: ++revision };
      }
      if (name === "fuel_board")
        return { data: { meals: [], locations: [], start_date: "2026-01-01" } };
      throw Error(name);
    },
  };
  let account;
  const bridge = {
    snapshot: () => structuredClone(snap),
    replace: (data) => {
      snap = data;
    },
    refresh() {},
    navigate: (view) => account.view(view),
    message() {},
    nutrients: [],
    meals: [],
  };
  account = createAccount(bridge, { client: fake });
  const settle = () => new Promise((r) => setTimeout(r, 25));
  authChange("SIGNED_IN", { user: { id: "a", email: "a@example.com" } });
  await settle();
  assert.equal(snap.goals.calories, "2000");
  assert.ok(document.querySelector("#settings-form"));
  assert.equal(account.hasMenus(), false);
  document.querySelector("#school-search").value = "Cal Poly San Luis Obispo";
  document.querySelector("#accept-terms").checked = true;
  document
    .querySelector("#settings-form")
    .dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
  await settle();
  assert.equal(account.hasMenus(), true);
  assert.equal(profile.show_nickname, false);
  account.view("account");
  assert.ok(document.querySelector(".chart-bars"));
  assert.equal(document.querySelectorAll(".metric-card").length, 4);
  account.view("board");
  await settle();
  assert.ok(
    document.querySelector("#board-content").textContent.includes("Trending"),
  );
  assert.ok(
    document
      .querySelector("#board-content")
      .textContent.includes("Verified prices are not available"),
  );
  account.view("account");
  document.querySelector("#participating").checked = false;
  document
    .querySelector("#settings-form")
    .dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
  await settle();
  const count = calls.filter((x) => x === "fuel_board").length;
  account.view("board");
  await settle();
  assert.equal(calls.filter((x) => x === "fuel_board").length, count);
  assert.ok(
    document
      .querySelector("#board-view")
      .textContent.includes("enable aggregate"),
  );
  account.view("account");
  document.querySelector("#signout").click();
  await settle();
  assert.equal(account.user, null);
  assert.equal(snap.goals.calories, "2100");
  assert.equal(
    document.querySelector("#account-button").textContent,
    "Sign in →",
  );
  dom.window.close();
});
