import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./public-config.js";
import {
  SCHOOLS,
  VERSION,
  escapeHtml as esc,
  localDate,
  series,
  mergeGuest,
} from "./model.js";
import { legal } from "./legal.js";
import { mountSetup } from "./setup.js";
const $ = (s) => document.querySelector(s);
const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || SUPABASE_URL;
const supabaseKey = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY || SUPABASE_PUBLISHABLE_KEY;
const configured = Boolean(supabaseUrl && supabaseKey);
const defaultClient = configured ? createClient(supabaseUrl, supabaseKey) : null;
const blank = () => ({
  goals: { calories: "", protein: "", optionalGoals: {} },
  entries: [],
  dailyGoals: {},
});
const metrics = [
  ["calories", "Calories", "cal"],
  ["proteinGrams", "Protein", "g"],
  ["carbsGrams", "Carbs", "g"],
  ["fatGrams", "Fat", "g"],
];
export function createAccount(bridge, { client = defaultClient } = {}) {
  const configured = Boolean(client);
  let user = null,
    profile = null,
    revision = 0,
    loaded = false,
    dirty = false,
    saving = false,
    timer,
    epoch = 0,
    currentView = "dashboard",
    period = "week",
    metric = "calories",
    boardPeriod = "week",
    boardToken = 0,
    conflict = false;
  let guest = bridge.snapshot();
  let favorites = [];
  const allMetrics = [
    ...metrics,
    ...bridge.nutrients
      .filter((n) => !metrics.some((m) => m[0] === n.key))
      .map((n) => [n.key, n.label, n.unit]),
  ];
  const status = (message, error = false) => {
    const el = $("#account-status");
    el.textContent = message;
    el.classList.toggle("error", error);
    el.hidden = !error && (!message || /^(Guest plan|Your account is up to date|All changes saved)/.test(message));
    if (error && user) {
      const b = document.createElement("button");
      b.className = "secondary sync-retry";
      b.textContent = conflict ? "Reload server version" : "Retry";
      b.onclick = () => (conflict ? reload() : flush());
      el.append(b);
    }
  };
  const run = async (task) => {
    try {
      await task();
    } catch (e) {
      status(e.message || "Something went wrong. Please try again.", true);
    }
  };
  const setupComplete = () => loaded && SCHOOLS.some(s => s.id === profile?.school) && profile?.terms_version === VERSION;
  const requireUser = () => {
    if (!user) {
      auth();
      return false;
    }
    if (!loaded || conflict) {
      status("Your account is still loading. Please retry shortly.", true);
      return false;
    }
    if (!setupComplete()) {
      showAccount();
      return false;
    }
    return true;
  };
  function auth() {
    $("#auth-setup").hidden = configured;
    $("#auth-dialog").showModal();
  }
  function branding() {
    document.body.classList.toggle("setup-required", Boolean(user) && !setupComplete());
    const school = SCHOOLS.find((s) => s.id === profile?.school);
    const campusBrand = user && school ? school.platesName : "University Plates";
    document.body.classList.toggle("campus-branded", Boolean(user && school));
    const brand = document.querySelector(".site-header .brand");
    brand.replaceChildren();
    const mark = document.createElement("span");
    mark.className = "brand-mark"; mark.textContent = "✦"; mark.setAttribute("aria-hidden", "true");
    brand.append(mark, document.createTextNode(campusBrand));
    brand.href = user && school ? "app.html" : "index.html";
    brand.setAttribute("aria-label", `${campusBrand} home`);
    if (school && user) brand.title = school.name;
    else brand.removeAttribute("title");
    document.title = `${campusBrand} | Your daily fuel`;
    $("#account-button").textContent = user ? "Your account ↗" : "Sign in →";
    $("#guest-welcome").hidden = Boolean(user);
    $("#campus-notice").hidden = !user || !school || school.menus;
    $("#campus-notice").textContent =
      school && !school.menus
        ? `${school.name} · Menus are coming soon. Your personal targets and history are still available.`
        : "";
    $("#coverage-note").hidden = !user || !school?.menus;
    $("#finder-view .hero-copy").textContent = school?.menus
      ? `Find meals at ${school.name} that fit your daily plan.`
      : !user ? "Guest preview: Cal Poly SLO menus. Log meals locally and explore without signing in." : "Choose your school after signing in to explore supported campus menus.";
  }
  function showAccount() {
    bridge.navigate("account");
  }
  function changed() {
    if (!user) return;
    if (!setupComplete()) { showAccount(); return; }
    if (!loaded || conflict) {
      status(
        "Changes are not saved. Reload your account before editing.",
        true,
      );
      return;
    }
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(flush, 450);
  }
  async function flush() {
    clearTimeout(timer);
    if (!user || !loaded || !dirty || saving || conflict) return;
    saving = true;
    const currentEpoch = epoch;
    dirty = false;
    const data = bridge.snapshot();
    status("Saving your account…");
    try {
      const { data: next, error } = await client.rpc("save_fuel_state", {
        expected_revision: revision,
        p_goals: data.goals,
        p_daily_goals: data.dailyGoals,
        p_entries: data.entries.map((e) => ({
          entry_id: e.entryId,
          meal_id: e.id,
          logged_on: e.date,
          school_id: e.school || "cal-poly-slo",
          servings: e.servings || 1,
        })),
        p_favorites: favorites,
      });
      if (error) throw error;
      if (currentEpoch !== epoch) return;
      revision = next;
      bridge.message("Plan saved to your account.");
      status("All changes saved.");
      if (currentView === "account") renderCharts();
    } catch (e) {
      if (currentEpoch !== epoch) return;
      dirty = true;
      conflict = /revision conflict/i.test(e.message);
      status(
        conflict
          ? "This account changed on another device. Export your current data, then reload the server version before editing."
          : `Not saved: ${e.message}. Keep this tab open and retry.`,
        true,
      );
    } finally {
      saving = false;
      if (
        dirty &&
        !conflict &&
        currentEpoch === epoch &&
        !$("#account-status").classList.contains("error")
      )
        flush();
    }
  }
  async function reload() {
    if (
      dirty &&
      !confirm(
        "Replace unsaved changes with the server version? Export first if you want to keep them.",
      )
    )
      return;
    await load(user);
  }
  async function load(nextUser) {
    if (!user) guest = bridge.snapshot();
    const token = ++epoch;
    clearTimeout(timer);
    loaded = false;
    dirty = false;
    conflict = false;
    user = nextUser;
    profile = null;
    favorites = [];
    bridge.replace(blank());
    branding();
    if (!user) {
      bridge.replace(guest);
      loaded = true;
      status("Guest plan · saved only in this browser.");
      const requested = new URLSearchParams(location.search).get("view");
      bridge.navigate(["dashboard", "finder", "history", "board"].includes(requested) ? requested : "dashboard");
      return;
    }
    showAccount();
    status("Loading your private account…");
    try {
      const { data: payload, error } = await client.rpc("load_fuel_account");
      if (error) throw error;
      const { profile: p, state: s, logs, favorites: f } = payload;
      if (token !== epoch) return;
      profile = p;
      revision = s?.revision || 0;
      favorites = (f || []).map((r) => ({
        meal_id: r.meal_id,
        school_id: r.school_id,
        saved_on: r.saved_on,
      }));
      bridge.replace({
        goals: s?.goals || {},
        dailyGoals: s?.daily_goals || {},
        entries: (logs || []).map((r) => ({
          entryId: r.entry_id,
          id: r.meal_id,
          date: r.logged_on,
          school: r.school_id,
          snapshot: r.snapshot,
          servings: r.servings,
        })),
      });
      loaded = true;
      branding();
      bridge.refresh();
      status("");
      if (!setupComplete()) showAccount();
      else {
        const requested = new URLSearchParams(location.search).get("view");
        bridge.navigate(["dashboard", "finder", "history", "board"].includes(requested) ? requested : "account");
        if (sessionStorage.getItem("fuel-pending-plan")) {
          const pending = JSON.parse(
            sessionStorage.getItem("fuel-pending-plan"),
          );
          sessionStorage.removeItem("fuel-pending-plan");
          bridge.replace({ ...bridge.snapshot(), goals: pending });
          changed();
          await flush();
        }
      }
    } catch (e) {
      if (token !== epoch) return;
      status(`Could not load your account: ${e.message}`, true);
      showAccount();
    }
  }
  async function saveSettings(event) {
    event.preventDefault();
    if (!loaded) return;
    const completingSetup = !setupComplete();
    const school = SCHOOLS.find((s) => s.name === $("#school-search").value);
    if (!school) throw Error("Choose a school from the suggestions.");
    const participating = $("#participating").checked;
    const showNickname = participating && $("#show-nickname").checked;
    const nickname = $("#nickname").value.trim();
    if (showNickname && !/^[A-Za-z0-9 _-]{2,24}$/.test(nickname))
      throw Error("Choose a nickname with 2–24 letters, numbers, spaces, underscores or hyphens.");
    const accepting = !profile || profile.terms_version !== VERSION;
    if (accepting && !$("#accept-terms").checked)
      throw Error("Please read and accept the Terms and Privacy Notice.");
    const { error } = await client.rpc("save_fuel_profile", {
      p_school: school.id,
      p_nickname: nickname,
      p_participating: participating,
      p_show_nickname: showNickname,
      p_terms_version: VERSION,
    });
    if (error) throw error;
    profile = {
      ...profile,
      school: school.id,
      nickname,
      participating,
      show_nickname: showNickname,
      terms_version: VERSION,
    };
    branding();
    bridge.refresh();
    renderAccount();
    status("Account settings saved.");
    if (sessionStorage.getItem("fuel-pending-plan")) {
      const goals = JSON.parse(sessionStorage.getItem("fuel-pending-plan"));
      sessionStorage.removeItem("fuel-pending-plan");
      bridge.replace({ ...bridge.snapshot(), goals });
      changed();
      await flush();
    }
    if (completingSetup) bridge.navigate("dashboard");
  }
  function renderAccount() {
    const el = $("#account-view");
    if (!user) {
      el.innerHTML =
        '<h1>Your Fuel</h1><p>Sign in to save your plan and see your progress across devices.</p><button class="primary" id="account-signin">Sign in →</button>';
      $("#account-signin").onclick = auth;
      return;
    }
    if (!loaded) {
      el.innerHTML =
        '<h1>Your account</h1><p>Your private records could not be loaded yet.</p><button id="retry-load" class="primary">Retry loading</button>';
      $("#retry-load").onclick = () => run(() => load(user));
      return;
    }
    if (!setupComplete()) {
      mountSetup(el, {
        schools: SCHOOLS,
        onSave: saveSettings,
        onSignout: () => run(async () => {
          const { error } = await client.auth.signOut();
          if (error) throw error;
          await load(null);
        }),
      });
      return;
    }
    const needsTerms = profile?.terms_version !== VERSION;
    const selected = SCHOOLS.find((s) => s.id === profile?.school);
    el.innerHTML = `<div class="panel-heading"><div><p class="eyebrow">${selected ? esc(selected.name) : "MAKE YOURSELF AT HOME"}</p><h1>Your Fuel</h1><p class="account-email">${esc(user.email)}</p></div><div class="dashboard-actions"><button id="export-data" class="secondary">Export my data</button><button id="signout" class="secondary">Sign out</button></div></div>${!selected ? '<div class="account-banner">Choose your school to finish setting up your account.</div>' : ""}<div id="personal-charts"></div><div class="settings-grid"><form id="settings-form" class="settings-card"><h2>Your account</h2><label>School<input id="school-search" list="school-options" value="${esc(selected?.name || "")}" placeholder="Search CSU schools…" required autocomplete="off"><datalist id="school-options">${SCHOOLS.map((s) => `<option value="${esc(s.name)}"></option>`).join("")}</datalist></label><p class="fine-print">Cal Poly SLO menus are available now. Other CSU menus are coming soon. Your school is self-selected.</p><h2>Fuel Board settings</h2><label class="check-row"><input id="participating" type="checkbox" ${profile?.participating !== false ? "checked" : ""}>Include my eligible meal activity in aggregate campus trends. Participation is required to view the Fuel Board.</label><label>Nickname<input id="nickname" maxlength="24" minlength="2" pattern="[A-Za-z0-9 _-]{2,24}" value="${esc(profile?.nickname || "")}" placeholder="Pick a name for the board"></label><label class="check-row"><input id="show-nickname" type="checkbox" ${profile?.show_nickname ? "checked" : ""}>Show my nickname beside meals I contribute to qualifying campus rankings. My personal nutrition history stays private.</label>${needsTerms ? '<label class="check-row"><input id="accept-terms" type="checkbox" required>I accept the Terms and acknowledge the Privacy Notice, including aggregate meal participation.</label>' : ""}<p><button class="text-button" type="button" data-legal="terms">Read Terms</button> · <button class="text-button" type="button" data-legal="privacy">Read Privacy Notice</button></p><button class="primary">${needsTerms ? "Finish setup" : "Save settings"}</button></form><div class="settings-card"><h2>Your plan, your pace.</h2><p>Only meals you log as eaten count toward your consumption charts. Saving a favorite does not mean you ate it.</p><button id="edit-targets" class="secondary">Edit daily targets</button><h3>Bring your history with you</h3><p>Import this browser’s guest targets and existing meal history. Duplicate entries are skipped. Guest history is associated with Cal Poly SLO.</p><button id="import-guest" class="secondary">Import browser history</button><h3>Account data</h3><p>Download your records before deleting your account. Deletion removes your profile, meal logs, favorites and ranking contributions.</p><button id="delete-account" class="danger-button">Delete my account</button><p class="fine-print">Legal documents are drafts pending final review before public launch.</p></div></div>`;
    $("#settings-form").onsubmit = (e) => run(() => saveSettings(e));
    $("#edit-targets").onclick = () => bridge.navigate("dashboard");
    $("#export-data").onclick = exportData;
    $("#import-guest").onclick = () =>
      run(async () => {
        if (!requireUser()) return;
        const normalized = {
          ...guest,
          entries: guest.entries.map((e) => ({
            ...e,
            school: e.school || "cal-poly-slo",
            snapshot: e.snapshot || bridge.meals.find((m) => m.id === e.id),
          })),
        };
        bridge.replace(mergeGuest(bridge.snapshot(), normalized));
        changed();
        await flush();
        renderCharts();
      });
    $("#signout").onclick = () =>
      run(async () => {
        if (dirty) {
          await flush();
          if (dirty)
            throw Error(
              "Your changes are not saved. Export them or retry before signing out.",
            );
        }
        const { error } = await client.auth.signOut();
        if (error) throw error;
      });
    $("#delete-account").onclick = () =>
      run(async () => {
        if (
          !confirm(
            "Permanently delete your University Plates account and all saved records? This cannot be undone.",
          )
        )
          return;
        clearTimeout(timer);
        await flush();
        if (saving || dirty)
          throw Error(
            "Wait for pending changes to finish, then retry deletion.",
          );
        const { error } = await client.rpc("delete_fuel_account");
        if (error) throw error;
        await client.auth.signOut({ scope: "local" });
        await load(null);
        status("Account deleted.");
      });
    renderCharts();
  }
  function exportData() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            profile,
            ...bridge.snapshot(),
            favorites,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "campus-fuel-export.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function renderCharts() {
    const el = $("#personal-charts");
    if (!el) return;
    const snap = bridge.snapshot();
    const rows = series(snap.entries, period, metric);
    const m = allMetrics.find((m) => m[0] === metric);
    const goal =
      Number(
        metric === "calories"
          ? snap.goals.calories
          : metric === "proteinGrams"
            ? snap.goals.protein
            : snap.goals.optionalGoals?.[metric],
      ) || 0;
    const max = Math.max(1, goal, ...rows.map((r) => r.value));
    const totals = metrics
      .map(([key, label, unit]) => {
        const values = series(snap.entries, period, key);
        const total = values.reduce((s, r) => s + r.value, 0);
        return `<article class="metric-card"><span>${label}</span><strong>${Math.round(total).toLocaleString()}${unit === "g" ? "g" : ""}</strong><small>Recorded total · ${values.filter((r) => r.tracked).length} tracked days${values.some((r) => r.tracked && !r.complete) ? " · incomplete values" : ""}</small></article>`;
      })
      .join("");
    el.innerHTML = `<div class="chart-controls"><label>Period <select id="dashboard-period">${[
      ["day", "Today"],
      ["week", "Last 7 days"],
      ["month", "Last 30 days"],
      ["year", "Last 365 days"],
    ]
      .map(
        ([v, l]) =>
          `<option value="${v}" ${period === v ? "selected" : ""}>${l}</option>`,
      )
      .join(
        "",
      )}</select></label><label>Metric <select id="dashboard-metric">${allMetrics.map(([v, l]) => `<option value="${v}" ${metric === v ? "selected" : ""}>${l}</option>`).join("")}</select></label></div><div class="metric-grid">${totals}</div><div class="chart-card"><h2>${m[1]} over time</h2><p class="chart-note">Daily recorded totals · ${m[2]}${goal ? ` · dashed line: current daily target ${goal}${m[2]}` : " · set a daily target in Your Fuel"}</p><div class="chart-bars" role="img" aria-label="${m[1]} by day. Exact values are in the data table below.">${goal ? `<span class="goal-line" style="bottom:${(goal / max) * 95}%"></span>` : ""}${rows.map((r) => `<span class="chart-bar ${!r.tracked ? "untracked" : !r.complete ? "incomplete" : ""}" style="height:${Math.max(1, (r.value / max) * 95)}%" title="${r.date}: ${r.tracked ? `${Math.round(r.value)}${m[2]}${!r.complete ? " (incomplete)" : ""}` : "Not tracked"}"></span>`).join("")}</div><div class="chart-labels"><span>${rows[0].date}</span><span>${rows.at(-1).date}</span></div><p class="chart-note">Gray marks mean no meals were tracked, not zero food consumed. Striped bars contain missing nutrition values. Targets shown are your current targets, not historical prescriptions.</p><details><summary>View accessible daily data</summary><div class="chart-table"><table><thead><tr><th>Date</th><th>${m[1]}</th><th>Daily target at logging</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r.date}</td><td>${r.tracked ? `${Math.round(r.value)}${m[2]}${r.complete ? "" : " (incomplete)"}` : "Not tracked"}</td><td>${esc(metric === "calories" ? snap.dailyGoals[r.date]?.calories : metric === "proteinGrams" ? snap.dailyGoals[r.date]?.protein : snap.dailyGoals[r.date]?.optionalGoals?.[metric]) || "Not recorded"}</td></tr>`).join("")}</tbody></table></div></details></div>`;
    $("#dashboard-period").onchange = (e) => {
      period = e.target.value;
      renderCharts();
    };
    $("#dashboard-metric").onchange = (e) => {
      metric = e.target.value;
      renderCharts();
    };
  }
  async function renderBoard() {
    const el = $("#board-view");
    const token = ++boardToken;
    const periodControls = () => `<div class="board-periods" role="group" aria-label="Ranking period">${[["day", "Today"], ["week", "This week"], ["month", "This month"]].map(([v,l]) => `<button type="button" data-board-period="${v}" aria-pressed="${boardPeriod === v}">${l}</button>`).join("")}</div>`;
    const bindPeriods = () => el.querySelectorAll("[data-board-period]").forEach(button => {
      button.onclick = () => {
        if (boardPeriod === button.dataset.boardPeriod) return;
        boardPeriod = button.dataset.boardPeriod;
        run(renderBoard);
      };
    });
    if (!user) {
      const picks = bridge.meals.filter(m => !m.isMealIdea && Number.isFinite(m.proteinGrams))
        .sort((a,b) => b.proteinGrams-a.proteinGrams).slice(0,6);
      const start = new Date(localDate() + "T12:00:00");
      if (boardPeriod === "week") start.setDate(start.getDate() - (start.getDay() + 6) % 7);
      if (boardPeriod === "month") start.setDate(1);
      const startDate = `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,"0")}-${String(start.getDate()).padStart(2,"0")}`;
      const entries = bridge.snapshot().entries.filter(e => e.date >= startDate && e.date <= localDate());
      const distinct = new Set(entries.map(e => e.id)).size;
      el.innerHTML = `<div class="panel-heading"><div><p class="eyebrow">CAL POLY SLO · GUEST PREVIEW</p><h1>The Fuel Board</h1><p>Your next campus favorite starts here.</p></div>${periodControls()}</div><div class="board-grid"><article class="board-card"><div class="board-card-heading"><span class="board-icon" aria-hidden="true">✦</span><h2>Protein Picks</h2></div><p>Browse the menu’s highest protein options. Tap a meal for nutrition details. Menu picks do not change by period.</p><ol class="board-list">${picks.map(m=>`<li><div><button class="board-meal" data-board-meal="${esc(m.id)}">${esc(m.name)} <span aria-hidden="true">↗</span></button><small>${esc(m.location)} · ${esc(m.servingSize)}</small></div><span class="board-count">${m.proteinGrams}g</span></li>`).join("") || '<li>No menu nutrition records available.</li>'}</ol></article><div class="board-side"><article class="board-card"><div class="board-card-heading"><span class="board-icon" aria-hidden="true">⌕</span><h2>Your discoveries</h2></div><p>${({day:"Today",week:"This week",month:"This month"})[boardPeriod]} · saved in this browser</p><strong class="discovery-number">${distinct}<small>different dishes logged</small></strong><button class="primary" id="board-explore">Find your next meal →</button></article><article class="board-card"><div class="board-card-heading"><span class="board-icon" aria-hidden="true">↗</span><h2>Campus favorites</h2></div><p>Sign in and choose your school to see qualifying campus trends. Rankings use real activity from at least five participating accounts.</p><button class="secondary" id="board-signin">Sign in to explore →</button></article></div></div><p class="fine-print">Protein is per listed serving. Confirm portions and availability with dining staff. Verified prices are not available yet.</p>`;
      bindPeriods();
      el.querySelectorAll("[data-board-meal]").forEach(button => button.onclick = () => bridge.openMeal?.(button.dataset.boardMeal));
      $("#board-explore").onclick = () => bridge.navigate("finder");
      $("#board-signin").onclick = auth;
      return;
    }
    if (
      !profile?.school ||
      profile.terms_version !== VERSION ||
      !profile.participating
    ) {
      el.innerHTML =
        '<h1>The Fuel Board</h1><p>Choose your school and enable aggregate meal participation in account settings to view campus trends. Your private dashboard is available either way.</p><button class="primary" id="board-settings">Open account settings</button>';
      $("#board-settings").onclick = showAccount;
      return;
    }
    const school = SCHOOLS.find((s) => s.id === profile.school);
    el.innerHTML = `<div class="panel-heading"><div><p class="eyebrow">${esc(school.name)}</p><h1>The Fuel Board</h1><p>Your campus, on a plate.</p></div><div class="board-periods" role="group" aria-label="Ranking period">${[["day", "Today"], ["week", "This week"], ["month", "This month"]].map(([v,l]) => `<button type="button" data-board-period="${v}" aria-pressed="${boardPeriod === v}">${l}</button>`).join("")}</div></div><p class="fine-print">Meal rankings, never a competition to eat more. Activity rankings require five distinct participating accounts per meal or location. Weekly and monthly periods use the campus calendar in Pacific time.</p><div id="board-content" aria-live="polite" aria-busy="true">Loading campus trends…</div>`;
    el.querySelectorAll("[data-board-period]").forEach(button => {
      button.onclick = () => {
        if (boardPeriod === button.dataset.boardPeriod) return;
        boardPeriod = button.dataset.boardPeriod;
        run(renderBoard);
      };
    });
    if (!school.menus) {
      $("#board-content").innerHTML =
        '<div class="settings-card"><h2>Something good is coming.</h2><p>This campus does not have menus yet. Your school selection is saved.</p></div>';
      return;
    }
    const { data, error } = await client.rpc("fuel_board", {
      p_period: boardPeriod,
    });
    if (token !== boardToken) return;
    $("#board-content").setAttribute("aria-busy", "false");
    if (error) throw error;
    const rows = data?.meals || [];
    const catalog = bridge.meals;
    const protein = catalog
      .filter((m) => typeof m.proteinGrams === "number")
      .sort((a, b) => b.proteinGrams - a.proteinGrams)
      .slice(0, 5);
    const valued = catalog
      .filter(
        (m) =>
          typeof m.price === "number" &&
          m.price > 0 &&
          typeof m.proteinGrams === "number",
      )
      .sort((a, b) => b.proteinGrams / b.price - a.proteinGrams / a.price)
      .slice(0, 5);
    const list = (items, render) =>
      items.length
        ? `<ol class="board-list">${items.slice(0, 5).map(render).join("")}</ol>`
        : "<p>No qualifying activity yet. Keep exploring—real rankings will appear as this campus grows.</p>";
    const ranked = (r, field) =>
      `<li><div>${esc(r.name)}<small>${esc(r.location)}${r.nicknames?.length ? ` · Public contributors: ${r.nicknames.map(esc).join(", ")}` : ""}</small></div><span class="board-count">${r[field]} students</span></li>`;
    const card = (title, description, body) =>
      `<article class="board-card"><div class="board-card-heading"><span class="board-icon" aria-hidden="true">${({Trending:"↗", "Campus Favorites":"♡", "Protein Picks":"✦", "Hidden Gems":"◇", "Best Value":"◎", "Dining Hall Showdown":"⚑", "Discovery Challenge":"⌕"})[title] || "✦"}</span><h2>${title}</h2></div><p>${description}</p>${body}</article>`;
    const discovery = bridge
      .snapshot()
      .entries.filter(
        (e) =>
          e.school === school.id &&
          e.date >= (data?.start_date || localDate()) &&
          e.date <= localDate(),
      );
    const distinct = new Set(discovery.map((e) => e.id)).size;
    $("#board-content").innerHTML = `<div class="board-grid">${card(
      "Trending",
      "Most distinct students logging a meal as eaten.",
      list(
        [...rows]
          .filter((r) => r.eaters >= 5)
          .sort((a, b) => b.eaters - a.eaters),
        (r) => ranked(r, "eaters"),
      ),
    )}${card(
      "Campus Favorites",
      "Meals saved by the most distinct students. A save is not a meal eaten.",
      list(
        [...rows]
          .filter((r) => r.savers >= 5)
          .sort((a, b) => b.savers - a.savers),
        (r) => ranked(r, "savers"),
      ),
    )}${card(
      "Protein Picks",
      "Menu comparison: grams of protein per listed serving, not student consumption.",
      list(
        protein,
        (m) =>
          `<li><div>${esc(m.name)}<small>${esc(m.location)} · ${esc(m.servingSize)}</small></div><span class="board-count">${m.proteinGrams}g</span></li>`,
      ),
    )}${card("Best Value", "Protein per dollar, using verified prices only.", valued.length ? list(valued, (m) => `<li><div>${esc(m.name)}</div><span class="board-count">${(m.proteinGrams / m.price).toFixed(1)}g/$</span></li>`) : "<p>Verified prices are not available yet. We won’t guess.</p>")}${card(
      "Hidden Gems",
      "Meals with at least five distinct savers and fewer logged eaters, ordered by saves.",
      list(
        [...rows]
          .filter((r) => r.savers >= 5 && r.eaters < r.savers)
          .sort((a, b) => b.savers - a.savers),
        (r) => ranked(r, "savers"),
      ),
    )}${card(
      "Dining Hall Showdown",
      "Locations ranked by distinct students logging meals.",
      list(
        data?.locations || [],
        (r) =>
          `<li><div>${esc(r.location)}</div><span class="board-count">${r.students} students</span></li>`,
      ),
    )}${card("Discovery Challenge", "Your private progress: try different dishes at your own pace.", `<p><strong>${distinct}</strong> different dishes logged in this period.</p><p class="fine-print">No public student ranking, calorie competition or streak penalty.</p>`)}</div>`;
  }
  document.addEventListener("click", (event) => {
    const close = event.target.closest("[data-close]");
    if (close) $("#" + close.dataset.close).close();
    const link = event.target.closest("[data-legal]");
    if (link) {
      $("#legal-content").innerHTML = legal[link.dataset.legal];
      $("#legal-content h2").id = "legal-title";
      $("#legal-dialog").showModal();
    }
  });
  $("#account-button").onclick = () => (user ? showAccount() : auth());
  $("#google-login").onclick = () =>
    run(async () => {
      if (!client)
        throw Error("Supabase configuration is required before signing in.");
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: new URL("./app.html", location.href).href },
      });
      if (error) throw error;
    });
  const authTask = async (task) => {
    const buttons = [...$("#auth-dialog").querySelectorAll("button")];
    buttons.forEach((b) => (b.disabled = true));
    try {
      await task();
    } catch (e) {
      $("#auth-message").textContent = e.message;
    } finally {
      buttons.forEach((b) => (b.disabled = false));
    }
  };
  $("#email-form").onsubmit = (e) => {
    e.preventDefault();
    authTask(async () => {
      if (!client)
        throw Error("Supabase configuration is required before signing in.");
      const email = $("#auth-email").value.trim();
      const { error } = await client.auth.signInWithOtp({ email });
      if (error) throw error;
      sessionStorage.setItem("fuel-login-email", email);
      $("#code-form").hidden = false;
      $("#auth-message").textContent =
        "Check your inbox for your sign-in code. You can request another code after the resend cooldown.";
      $("#auth-code").focus();
    });
  };
  $("#code-form").onsubmit = (e) => {
    e.preventDefault();
    authTask(async () => {
      const { error } = await client.auth.verifyOtp({
        email:
          sessionStorage.getItem("fuel-login-email") ||
          $("#auth-email").value.trim(),
        token: $("#auth-code").value.trim(),
        type: "email",
      });
      if (error) throw error;
      sessionStorage.removeItem("fuel-login-email");
      $("#auth-dialog").close();
    });
  };
  window.addEventListener("beforeunload", (e) => {
    if (dirty || saving) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  window.addEventListener("online", () => {
    if (dirty && !conflict) flush();
  });
  if (client) {
    client.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED") return;
      if (session?.user?.id === user?.id && loaded) return;
      setTimeout(() => {
        if ($("#auth-dialog").open && session) $("#auth-dialog").close();
        load(session?.user || null);
      }, 0);
    });
  } else {
    loaded = true;
    branding();
    status(
      "Preview · sign-in needs Supabase setup. Guest plans remain on this device.",
    );
  }
  return {
    get user() {
      return user;
    },
    get school() {
      return profile?.school || (!user ? "cal-poly-slo" : undefined);
    },
    changed,
    hasMenus: () =>
      Boolean(
        !user || (setupComplete() && SCHOOLS.find((s) => s.id === profile?.school)?.menus),
      ),
    allowView(view) {
      if (user && view !== "account" && !requireUser()) return false;
      return true;
    },
    view(view) {
      if (user && view !== "account" && !setupComplete()) { showAccount(); return; }
      currentView = view;
      $("#account-view").hidden = view !== "account";
      $("#board-view").hidden = view !== "board";
      if (view === "account") renderAccount();
      if (view === "board") run(renderBoard);
    },
    canLog: () =>
      !user || (requireUser() && SCHOOLS.find((s) => s.id === profile.school)?.menus),
    savePlan() {
      if (!user) {
        sessionStorage.setItem(
          "fuel-pending-plan",
          JSON.stringify(bridge.snapshot().goals),
        );
        auth();
      } else if (requireUser()) {
        changed();
        flush();
      }
    },
    isFavorite: (id) =>
      favorites.some(
        (f) => f.meal_id === id && f.school_id === profile?.school,
      ),
    favorite(id) {
      if (!requireUser()) return;
      const at = favorites.findIndex(
        (f) => f.meal_id === id && f.school_id === profile.school,
      );
      if (at >= 0) favorites.splice(at, 1);
      else
        favorites.push({
          meal_id: id,
          school_id: profile.school,
          saved_on: localDate(),
        });
      changed();
      bridge.refresh();
    },
  };
}
