import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const read = p => readFileSync(new URL('../' + p, import.meta.url),'utf8');
test('inline nutrient cards retain all targets and save/reload the full plan', () => {
 const dom = new JSDOM(read('app.html'),{url:'http://localhost/app.html',runScripts:'outside-only'});
 const w=dom.window; w.structuredClone=structuredClone;
 w.HTMLElement.prototype.scrollIntoView=function(){};
 const existingPreferences={vegetarian:true,vegan:true,avoidingGluten:true};
 w.localStorage.setItem('campusfuel-goals',JSON.stringify(existingPreferences));
 w.mountMealAssistant=()=>({reset(){}});
 let bridge,saved;
 w.createAccount=b=>{bridge=b;return {user:null,hasMenus:()=>false,isFavorite:()=>false,savePlan:()=>{saved=b.snapshot();}}};
 w.eval(read('data/meals.js'));
 w.eval(read('app.js').replace(/^import .*;\n/gm,''));
 const set=(selector,value)=>{const el=w.document.querySelector(selector);el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));};
 set('#goal-calories','2200');set('#goal-protein','140');
 w.document.querySelector('[value="carbsGrams"]').click();
 set('[data-nutrient="carbsGrams"]','250');
 w.document.querySelector('[data-plan-category="Minerals"]').click();
 assert.equal(w.document.querySelector("#goal-details").hidden,false);
 w.document.querySelector('[value="sodiumMilligrams"]').click();
 set('[data-nutrient="sodiumMilligrams"]','2000');
 w.document.querySelector('[data-plan-category="Vitamins"]').click();
 w.document.querySelector('[value="vitaminCMilligrams"]').click();
 set('[data-nutrient="vitaminCMilligrams"]','85.5');
 assert.equal(w.document.querySelector('.plan-preferences').hidden,true);
 w.document.querySelector('[data-category="Macros"]').click();
 assert.equal(w.document.querySelector('[data-nutrient="carbsGrams"]').value,'250');
 assert.equal(w.localStorage.getItem('campusfuel-goals'),JSON.stringify(existingPreferences),'editing alone must not save the plan');
 w.document.querySelector('#goals-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 assert.equal(w.document.querySelectorAll('.custom-goal-card').length,3);
 assert.equal(saved.goals.calories,'2200');
 assert.equal(w.document.querySelector('#save-plan').textContent,'✓ Saved');
 assert.equal(w.document.querySelector('#save-plan').classList.contains('is-saved'),true);
 bridge.message('Could not sync','error');
 assert.equal(w.document.querySelector('#save-plan').classList.contains('is-saved'),false);
 bridge.message('Saved to account','saved');
 assert.equal(w.document.querySelector('#save-plan').textContent,'✓ Saved');
 assert.deepEqual({...saved.goals.optionalGoals},{carbsGrams:'250',sodiumMilligrams:'2000',vitaminCMilligrams:'85.5'});
 assert.equal(saved.goals.protein,'140');
 for(const key of ['vegetarian','vegan','avoidingGluten']) assert.equal(saved.goals[key],true);
 const beforeInvalid=saved;
 w.document.querySelector('[value="fiberGrams"]').click();
 w.document.querySelector('#goal-details').hidden=true;
 w.document.querySelector('#goals-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 assert.equal(saved,beforeInvalid,'incomplete optional targets must not overwrite saved goals');
 assert.equal(w.document.querySelector('#goal-details').hidden,false,'show the invalid optional target');
 assert.match(w.document.querySelector('#plan-status').textContent,/Fiber target/);
 w.document.querySelector('[value="fiberGrams"]').click();
 const stored=JSON.parse(w.localStorage.getItem('campusfuel-goals'));
 assert.deepEqual({...stored.optionalGoals},{carbsGrams:'250',sodiumMilligrams:'2000',vitaminCMilligrams:'85.5'});
 const reload=new JSDOM(read('app.html'),{url:'http://localhost/app.html',runScripts:'outside-only'});
 reload.window.structuredClone=structuredClone;
 reload.window.mountMealAssistant=()=>({reset(){}});
 reload.window.localStorage.setItem('campusfuel-goals',JSON.stringify(stored));
 reload.window.createAccount=()=>({user:null,hasMenus:()=>false,isFavorite:()=>false});
 reload.window.eval(read('data/meals.js'));
 reload.window.eval(read('app.js').replace(/^import .*;\n/gm,''));
 assert.equal(reload.window.document.querySelector('#goal-calories').value,'2200');
 assert.equal(reload.window.document.querySelector('#goal-protein').value,'140');
 assert.equal(reload.window.document.querySelector('#pref-vegetarian').checked,true);
 assert.match(reload.window.document.querySelector('#bento-goal-summary').textContent,/Vitamin C/);
 reload.window.close();
 bridge.replace({goals:{calories:'1800',protein:'90',optionalGoals:{fiberGrams:'25'}},entries:[],dailyGoals:{}});
 assert.equal(w.document.querySelector('#goal-calories').value,'1800');
 assert.equal(w.document.querySelector('[data-nutrient="fiberGrams"]').value,'25');
 dom.window.close();
});

test('restaurant controls are built from the imported menu locations', () => {
 const dom = new JSDOM(read('app.html'),{url:'http://localhost/app.html',runScripts:'outside-only'});
 const w=dom.window; w.structuredClone=structuredClone;
 w.HTMLElement.prototype.scrollIntoView=function(){};
 w.mountMealAssistant=()=>({reset(){}});
 w.createAccount=()=>({user:null,hasMenus:()=>true,isFavorite:()=>false});
 w.eval(read('data/meals.js'));
 w.eval(read('app.js').replace(/^import .*;\n/gm,''));
 const locations=["Chick-fil-A","Julian's","Panda Express","PolyChoice","Pom & Honey","Red Radish"];
 assert.deepEqual(
   [...w.document.querySelectorAll('#location-browse-chips .location-chip')].map((button)=>button.dataset.location),
   locations,
 );
 assert.deepEqual(
   [...w.document.querySelectorAll('#restaurant-tabs .restaurant-tab')].map((button)=>button.dataset.restaurant),
   ['',...locations],
 );
 const juliansQuick=w.document.querySelector('[data-location="Julian\\\'s"]');
 juliansQuick.click();
 assert.equal(w.document.querySelector('.location-chip.selected').dataset.location,"Julian's");
 assert.equal(w.document.querySelector('#meal-grid').textContent.includes("Julian's"),true);
 dom.window.close();
});
