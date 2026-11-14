# Campus Fuel

An early interactive prototype for a Cal Poly SLO campus meal-planning and macro-tracking assistant.

Students can set calorie, protein, and optional nutrient goals, get recommendations from meal records, and log meals to update their on-device daily totals.

## Run it locally

Ask Codex: **“Start the EcoMenu site locally and show me the preview.”**

Or, from this folder, run:

```bash
npm ci
npm run dev -- --port 4173
```

Then visit `http://127.0.0.1:4173` in your browser.

## Data integrity

The team's original verified nutrition export lives in `data/meals.json`. The website reads the compact generated version in `data/meals.js`. After the team updates the export, run:

```bash
bash scripts/build-meals-data.sh > data/meals.js
```

Use `null` for missing or uncertain facts. Do not treat missing labels as false, and do not invent nutrition or dietary labels. The Snack and Meal browse tags are interface categories based on the source menu category, not Cal Poly dietary or nutrition claims.

The website also generates meal ideas from the imported components in `data/meal-ideas.js`. Panda bowls combine one entrée and one side; Chick-fil-A ideas combine an entrée, side and bottled water; Red Radish ideas combine greens, protein and toppings. These are planning suggestions, not confirmed campus combos. Each component uses its source serving size, so users should confirm the actual portions and availability before ordering. A combined nutrient is left unknown if any component lacks that value. No sauces or other extras are assumed.

## Not yet included

- A real AI API connection (the current natural-language interpretation is local and rule-based)
- Expanded verified meal data
- Deployment

## Accounts, dashboards and The Fuel Board

This feature branch adds Google/email-code authentication through Supabase, school onboarding, account-backed history and nutrition charts, and campus meal rankings. See [SETUP.md](SETUP.md) for database migrations, Google/SMTP setup, Vercel preview steps and verification limits. Run `npm test` and `npm run build` before review.
