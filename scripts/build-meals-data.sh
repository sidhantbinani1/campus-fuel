#!/usr/bin/env bash
set -euo pipefail

# Converts the team's untouched Cal Poly menu export into the compact format
# used by the static CampusFuel prototype. Requires jq.
# Meal type is a UI browse tag based only on the source category, not a Cal Poly
# nutrition or dietary claim.

printf '%s\n' '// Generated from data/meals.json with scripts/build-meals-data.sh. Do not hand-edit this file.'
printf '%s\n' '// Prices and dietary labels remain null unless they are present in the verified source export.'
printf '%s' 'window.MEALS = '
jq '[
  .[] | .category as $category | {
    id,
    name,
    location: .restaurant,
    category,
    servingSize,
    calories,
    proteinGrams,
    fatGrams,
    carbsGrams,
    price,
    vegetarian,
    vegan,
    avoidingGluten,
    climateFriendly,
    description,
    mealType: (if (["Sides", "Desserts", "Drinks", "Condiments", "Dipping Sauces"] | index($category)) then "snack" else "meal" end),
    menuSource: .sourceUrl,
    priceSource: null,
    verifiedAt: .sourceDate
  }
]' data/meals.json
printf '%s\n' ';'
