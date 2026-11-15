# University Plates menu data contract

University Plates does not hard-code a university's meals, dining locations, or availability. Each school supplies changing records in this shared format; the decision rules then work across schools.

## Required fields

```json
{
  "id": "stable-school-item-id",
  "name": "Example meal",
  "location": "Campus dining location",
  "category": "Entree",
  "mealType": "meal",
  "calories": 640,
  "proteinGrams": 32,
  "menuSource": "https://school.example/menu",
  "verifiedAt": "2026-11-14"
}
```

`mealType` must be either `meal` or `snack`. Nutrition facts may be `null` when the school has not verified them. Do not replace missing facts with estimates.

## Optional fields that improve matching

```json
{
  "locationAliases": ["mesa", "mesa commons"],
  "description": "Grilled chicken with rice and vegetables",
  "ingredients": ["chicken", "rice", "broccoli"],
  "dietaryLabels": ["Vegetarian", "Avoiding Gluten"],
  "tags": ["bowl", "breakfast"],
  "searchTerms": ["quick", "protein"]
}
```

Use `locationAliases` for student shorthand at that school. Use `dietaryLabels` only when they come from the university or restaurant source; unknown labels stay absent or `null`.

## Reusable decision rules

The assistant recognizes preferences such as high/low calorie, high protein, light/filling, snack/meal, vegetables, common foods, protein exclusions, and explicit verified dietary labels. It then ranks or filters only records supplied by the selected school's data. It never generates menu items, nutrition facts, labels, prices, or availability.
