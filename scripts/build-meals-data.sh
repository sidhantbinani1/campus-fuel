#!/usr/bin/env bash
set -euo pipefail

# Converts the team's untouched Cal Poly menu export into the compact format
# used by the static CampusFuel prototype. Requires jq.
# Meal type is a UI browse tag based only on the source category, not a Cal Poly
# nutrition or dietary claim.

printf '%s\n' '// Generated from data/meals.json with scripts/build-meals-data.sh. Do not hand-edit this file.'
printf '%s\n' '// Dietary labels remain null unless they are present in the verified source export.'
printf '%s' 'window.MEALS = '
jq '[
  def nutrient($names): [ .nutritionValues[]? | select(.name as $name | $names | index($name)) | .value ] | map(select(. != null)) | first // null;
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
    fiberGrams: nutrient(["Dietary Fiber", "Dietary Fiber (g)"]),
    sugarGrams: nutrient(["Sugars", "Sugar (g)"]),
    saturatedFatGrams: nutrient(["Saturated Fat", "Saturated Fat (g)"]),
    transFatGrams: nutrient(["Trans Fat", "Trans Fat (g)"]),
    sodiumMilligrams: nutrient(["Sodium", "Sodium (mg)"]),
    cholesterolMilligrams: nutrient(["Cholesterol", "Cholesterol (mg)"]),
    potassiumMilligrams: nutrient(["Potassium", "Potassium (mg)"]),
    calciumMilligrams: nutrient(["Calcium", "Calcium (mg)"]),
    ironMilligrams: nutrient(["Iron", "Iron (mg)"]),
    vitaminARe: nutrient(["Vitamin A", "Vitamin A (RE)"]),
    vitaminCMilligrams: nutrient(["Vitamin C", "Vitamin C (mg)"]),
    vitaminDIu: nutrient(["Vitamin D (IU)"]),
    fatCalories: nutrient(["Fat Calories", "Calories From Fat"]),
    vegetarian,
    vegan,
    avoidingGluten,
    description,
    mealType: (if (["Sides", "Desserts", "Drinks", "Condiments", "Dipping Sauces"] | index($category)) then "snack" else "meal" end),
    menuSource: .sourceUrl,
    verifiedAt: .sourceDate
  }
]' data/meals.json
printf '%s\n' ';'
