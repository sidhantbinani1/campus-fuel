// Provider contract: async ({message, history, catalog, context}) => {text, mealIds}.
// Swap menuProvider for a server-backed provider later; the UI never needs API keys.
const groups = {
  chicken: /\b(chicken|nuggets?|poultry)\b/i,
  beef: /\b(beef|steak)\b/i,
  pork: /\b(pork|bacon|ham)\b/i,
  fish: /\b(fish|salmon|tuna|shrimp|seafood)\b/i,
  tofu: /\btofu\b/i,
  vegetables: /\b(vegetables?|veggies|broccoli|greens|spinach|lettuce|cabbage|carrots?|salad)\b/i,
};
const nutrients = [
  ['calories','calories','cal','calories|calorie|kcal|cal'],
  ['proteinGrams','protein','g','protein'], ['carbsGrams','carbs','g','carbs|carbohydrates'],
  ['fatGrams','fat','g','fat'], ['fiberGrams','fiber','g','fiber'], ['sugarGrams','sugar','g','sugar'],
  ['saturatedFatGrams','saturated fat','g','saturated fat'], ['transFatGrams','trans fat','g','trans fat'],
  ['sodiumMilligrams','sodium','mg','sodium'], ['cholesterolMilligrams','cholesterol','mg','cholesterol'],
  ['potassiumMilligrams','potassium','mg','potassium'], ['calciumMilligrams','calcium','mg','calcium'],
  ['ironMilligrams','iron','mg','iron'], ['vitaminCMilligrams','vitamin C','mg','vitamin c'],
  ['vitaminARe','vitamin A','RE','vitamin a'], ['vitaminDIu','vitamin D','IU','vitamin d'],
];
const description = m => `${m.name} ${m.description || ''} ${(m.components || []).map(c=>`${c.name} ${c.description||''}`).join(' ')}`;
const finite = n => typeof n === 'number' && Number.isFinite(n);

export function findMenuMatches({ message, history = [], catalog = [] }) {
  if (/\bhow (many|much)\b.*\b(calories|protein|macros|vitamins|minerals)\b|\bshould (i|my)\b.*\b(calories|protein|target|intake)\b|\b(recommend|set)\b.*\b(daily|targets?|intake)\b/i.test(message)) {
    return {text:'I help find meals using targets you enter. I don’t recommend daily calorie, protein, or nutrient targets. Tell me what kind of meal you’d like, or give me your own limits.', mealIds:[]};
  }
  if (!catalog.length) return {text:'There are no menu records for your selected campus yet. I can only suggest meals from available campus data; I won’t substitute another campus’s menu.',mealIds:[]};
  const previous = history.filter(m=>m.role==='user').slice(-4).map(m=>m.text);
  const fresh = /\b(start over|reset|new search|clear)\b/i.test(message);
  const requests = fresh ? [message] : [...previous, message];
  const excluded = new Set(), included = new Set();
  const limits = new Map();
  let recognized = false;
  for (const request of requests) {
    for (const [group,pattern] of Object.entries(groups)) {
      if (!pattern.test(request)) continue;
      recognized = true;
      const term = `(?:${pattern.source})`;
      const negative = new RegExp(`(?:no|not|without|avoid|skip|less|tired of|sick of|too much)\\s+(?:(?:any|more|much|some|of|the)\\s+){0,2}${term}|${term}[^.!?]{0,45}(?:too much|too often|again|something else)`, 'i');
      if (negative.test(request)) { excluded.add(group); included.delete(group); }
      else { included.add(group); excluded.delete(group); }
    }
    for (const [key,label,unit,terms] of nutrients) {
      const match=request.match(new RegExp(`(under|below|at most|up to|max(?:imum)?|at least|min(?:imum)?)\\s*(\\d+(?:\\.\\d+)?)\\s*(mg|g|grams?|milligrams?|iu|re|kcal|cal)?\\s*(?:of\\s*)?(?:${terms})\\b`,'i'));
      if(!match)continue;
      let value=Number(match[2]), supplied=(match[3]||unit).toLowerCase().replace(/^grams?$/,'g').replace(/^milligrams?$/,'mg').replace('kcal','cal');
      if(unit==='mg'&&supplied==='g')value*=1000;
      else if(unit==='g'&&supplied==='mg')value/=1000;
      else if(supplied!==unit.toLowerCase())return {text:`I can only compare ${label} in the menu's listed unit (${unit}). Please use that unit; I won’t guess a conversion.`,mealIds:[]};
      limits.set(key,{value,min:/at least|min/i.test(match[1]),label,unit});recognized=true;
    }
  }
  if (!recognized && !/\b(alternatives?|something else|anything|suggest|surprise|meal|food|hungry|options|reset|start over)\b/i.test(message)) {
    return {text:'Try a request like “no chicken,” “more vegetables,” or “under 700 calories.” I can match listed menu descriptions and explicit calorie/protein limits. I don’t infer ingredients or allergens that aren’t listed.', mealIds:[]};
  }
  let candidates = catalog.filter(m => {
    const text = description(m);
    if ([...excluded].some(g=>groups[g].test(text))) return false;
    if ([...included].some(g=>!groups[g].test(text))) return false;
    for(const [key,limit] of limits) {
      if(!finite(m[key]) || (limit.min ? m[key]<limit.value : m[key]>limit.value))return false;
    }
    return true;
  });
  // Prefer actual mains and assembled menu ideas over individual toppings.
  const wholeMeals = candidates.filter(m => m.isMealIdea || /sandwich|wrap|bowl|plate|nuggets?/i.test(m.name) || /entr[eé]es?/i.test(m.category || '') || (/salad/i.test(m.name) && /bowl|plate|serving/i.test(m.servingSize || '')));
  const componentsOnly = !wholeMeals.length && candidates.length > 0;
  if (wholeMeals.length) candidates = wholeMeals;
  const priorIds = new Set(history.filter(m=>m.role==='assistant').flatMap(m=>m.mealIds||[]));
  if (/\b(alternative|something else|different|more options)\b/i.test(message)) {
    const unseen=candidates.filter(m=>!priorIds.has(m.id));
    if(unseen.length) candidates=unseen;
  }
  const constraints = [...excluded].map(x=>`without ${x}`).concat([...included].map(x=>`with ${x}`));
  for(const limit of limits.values())constraints.push(`${limit.min?'at least':'at most'} ${limit.value}${limit.unit} ${limit.label}`);
  if(!candidates.length) return {text:`I couldn’t find a listed match${constraints.length?' '+constraints.join(', '):''}. I haven’t relaxed your request. Try changing a preference or limit.`,mealIds:[]};
  return {text:`${componentsOnly ? "Only individual menu components match, rather than complete meals. " : ""}Here are ${Math.min(3,candidates.length)} options from your campus menu records${constraints.length?' '+constraints.join(', '):''}. Nutrition uses the listed serving; confirm current availability with dining staff.`,mealIds:candidates.slice(0,3).map(m=>m.id)};
}
export const menuProvider = async request => findMenuMatches(request);

export function mountMealAssistant(root, { getCatalog, getContext, openMeal, provider = menuProvider }) {
  let history = [], version = 0, busy = false;
  const messages=root.querySelector('.assistant-messages'),form=root.querySelector('form'),input=form.querySelector('input'),submit=form.querySelector('button');
  function add(role,text,meals=[]){
    const block=document.createElement('div');block.className=`assistant-message ${role}`;
    const p=document.createElement('p');p.textContent=text;block.append(p);
    for(const meal of meals){const button=document.createElement('button');button.type='button';button.className='assistant-meal';const title=document.createElement('strong');title.textContent=meal.name;const details=document.createElement('small');details.textContent=`${meal.location} · ${finite(meal.calories)?meal.calories+' cal':'Calories unavailable'} · ${finite(meal.proteinGrams)?meal.proteinGrams+'g protein':'Protein unavailable'}`;button.append(title,details);button.onclick=()=>openMeal(meal.id);block.append(button);}
    messages.append(block);messages.scrollTop=messages.scrollHeight;
  }
  function reset(){version++;history=[];busy=false;submit.disabled=false;input.value='';messages.replaceChildren();add('assistant','What sounds good? Ask for vegetables, a change from chicken, or meals within your own limits.');}
  async function send(text){
    if(busy||!text.trim())return;busy=true;submit.disabled=true;input.value='';
    const current=version,catalog=getCatalog(),context=getContext();add('user',text);
    try{
      const response=await provider({message:text,history:structuredClone(history),catalog,context});
      if(current!==version)return;
      if(!response||typeof response.text!=='string'||!Array.isArray(response.mealIds))throw Error('Invalid assistant response');
      // Only render recommendations that resolve to this campus's current catalog.
      const ids=[...new Set(response.mealIds)].slice(0,3),meals=ids.map(id=>catalog.find(m=>m.id===id)).filter(Boolean);
      add('assistant',response.text,meals);history.push({role:'user',text},{role:'assistant',text:response.text,mealIds:meals.map(m=>m.id)});history=history.slice(-12);
    }catch{if(current===version)add('assistant','I couldn’t complete that request. Please try again, or use Find meals.');}
    finally{if(current===version){busy=false;submit.disabled=false;}}
  }
  form.onsubmit=e=>{e.preventDefault();send(input.value.trim());};
  root.querySelectorAll('[data-meal-prompt]').forEach(b=>b.onclick=()=>send(b.dataset.mealPrompt));
  root.querySelector('.assistant-reset').onclick=reset;
  reset();return {reset};
}
