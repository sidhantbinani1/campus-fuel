# CampusFuel SLO

An early interactive prototype for a Cal Poly SLO campus meal-planning and macro-tracking assistant.

Students can set calorie and protein goals plus a Dining Dollars planning balance, get recommendations from verified meal records, and log meals to update their on-device daily estimate.

## Run it locally

Ask Codex: **“Start the EcoMenu site locally and show me the preview.”**

Or, from this folder, run:

```bash
python3 -m http.server 4173
```

Then visit `http://localhost:4173` in your browser.

## Data integrity

The team's original verified nutrition export lives in `data/meals.json`. The website reads the compact generated version in `data/meals.js`. After the team updates the export, run:

```bash
bash scripts/build-meals-data.sh > data/meals.js
```

Use `null` for missing or uncertain facts. Do not treat missing labels as false, and do not invent prices, nutrition, or dietary labels. The Snack and Meal browse tags are interface categories based on the source menu category, not Cal Poly dietary or nutrition claims.

## Not yet included

- A real AI API connection (the current natural-language interpretation is local and rule-based)
- Price data (the budget planner can only subtract verified prices)
- Expanded verified meal data
- Deployment
- Cal Poly Dining Dollars integration. The current planner stores a user-entered estimate only in that browser; it does not access a Cal Poly account or track actual purchases.
