export const SCHOOL_NAMES = [
  "Cal Poly San Luis Obispo",
  "Cal Poly Humboldt",
  "Cal Poly Pomona",
  "CSU Bakersfield",
  "CSU Channel Islands",
  "Chico State",
  "CSU Dominguez Hills",
  "Cal State East Bay",
  "Fresno State",
  "Cal State Fullerton",
  "Cal State Long Beach",
  "Cal State Los Angeles",
  "CSU Monterey Bay",
  "CSU Northridge",
  "Sacramento State",
  "Cal State San Bernardino",
  "San Diego State",
  "San Francisco State",
  "San José State",
  "CSU San Marcos",
  "Sonoma State",
  "Stanislaus State",
];
const SCHOOL_BRANDS = [
  "Poly", "Humboldt", "CPP", "CSUB", "CSUCI", "Chico", "CSUDH", "CSUEB",
  "Fresno", "CSUF", "CSULB", "CSULA", "CSUMB", "CSUN", "Sac State", "CSUSB",
  "SDSU", "SFSU", "SJSU", "CSUSM", "Sonoma", "Stanislaus",
];
export const SCHOOLS = SCHOOL_NAMES.map((name, i) => ({
  id:
    i === 0
      ? "cal-poly-slo"
      : name
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-"),
  name,
  menus: i === 0,
  platesName: `${SCHOOL_BRANDS[i]} Plates`,
}));
export const VERSION = "2026-11-14";
export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export function periodStart(period, now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (period === "week") d.setDate(d.getDate() - 6);
  if (period === "month") d.setDate(d.getDate() - 29);
  if (period === "year") d.setDate(d.getDate() - 364);
  return localDate(d);
}
export function series(entries, period, metric, now = new Date()) {
  const start = periodStart(period, now),
    end = localDate(now);
  const days = [];
  const cursor = new Date(`${start}T12:00:00`);
  while (localDate(cursor) <= end) {
    const date = localDate(cursor);
    const rows = entries.filter((e) => e.date === date);
    const values = rows.map((e) =>
      typeof e.snapshot?.[metric] === "number"
        ? e.snapshot[metric] * (e.servings || 1)
        : typeof e.snapshot?.partialNutrition?.[metric] === "number"
          ? e.snapshot.partialNutrition[metric] * (e.servings || 1)
          : null,
    );
    days.push({
      date,
      value: values.reduce((s, n) => s + (typeof n === "number" ? n : 0), 0),
      tracked: rows.length > 0,
      complete:
        rows.length > 0 &&
        rows.every((e) => typeof e.snapshot?.[metric] === "number"),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}
export function mergeGuest(current, guest) {
  const ids = new Set(current.entries.map((e) => e.entryId));
  return {
    ...current,
    goals: Object.keys(guest.goals || {}).length ? guest.goals : current.goals,
    entries: [
      ...current.entries,
      ...guest.entries.filter((e) => !ids.has(e.entryId)),
    ],
    dailyGoals: { ...guest.dailyGoals, ...current.dailyGoals },
  };
}
