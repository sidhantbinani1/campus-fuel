import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {findMenuMatches, mountMealAssistant} from '../src/meal-assistant.js';
const catalog=[
 {id:'c',name:'Chicken bowl',description:'Chicken, rice, broccoli',location:'Campus kitchen',calories:600,proteinGrams:35,sodiumMilligrams:700,vitaminCMilligrams:20},
 {id:'t',name:'Tofu and broccoli bowl',description:'Tofu, vegetables and rice',location:'Campus kitchen',calories:550,proteinGrams:25,sodiumMilligrams:500,vitaminCMilligrams:30},
 {id:'b',name:'Beef bowl',description:'Beef with rice',location:'Campus kitchen',calories:750,proteinGrams:40,sodiumMilligrams:null,vitaminCMilligrams:null},
];
test('menu assistant preserves exclusions across turns and does not invent campus coverage or nutrition targets',()=>{
 const first=findMenuMatches({message:"I've had chicken too much this week. Something else?",catalog});
 assert.ok(first.mealIds.length);assert.ok(!first.mealIds.includes('c'));
 const second=findMenuMatches({message:'I want vegetables',catalog,history:[{role:'user',text:"I've had chicken too much this week. Something else?"}]});
 assert.deepEqual(second.mealIds,['t']);
 assert.deepEqual(findMenuMatches({message:'no chicken and I want vegetables',catalog}).mealIds,['t']);
 assert.deepEqual(findMenuMatches({message:'under 650 calories and at least 30g protein',catalog}).mealIds,['c']);
 assert.deepEqual(findMenuMatches({message:'at most 600mg sodium and at least 25mg vitamin c',catalog}).mealIds,['t']);
 assert.deepEqual(findMenuMatches({message:'at most 0.6g sodium',catalog}).mealIds,['t']);
 assert.deepEqual(findMenuMatches({message:'under 100 calories',catalog}).mealIds,[]);
 assert.deepEqual(findMenuMatches({message:'recommend a daily calorie target',catalog}).mealIds,[]);
 assert.match(findMenuMatches({message:'anything',catalog:[]}).text,/no menu records/);
 assert.deepEqual(findMenuMatches({message:'recommend chicken with at least 30g protein',catalog}).mealIds,['c']);
});
test('assistant provider can be swapped, unknown meal ids are dropped, text is escaped, and reset invalidates in-flight responses',async()=>{
 const dom=new JSDOM('<aside><div class="assistant-messages"></div><form><input><button>Send</button></form><button class="assistant-reset">Reset</button></aside>');
 globalThis.document=dom.window.document;
 const root=document.querySelector('aside');let resolve,request,suggestions;
 const ui=mountMealAssistant(root,{getCatalog:()=>catalog,getContext:()=>({school:'cal-poly-slo'}),openMeal(){},showSuggestions:value=>{suggestions=value;},provider:async data=>{request=data;return await new Promise(r=>resolve=r);}});
 const send=()=>{root.querySelector('input').value='alternatives';root.querySelector('form').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));};
 send();assert.equal(request.context.school,'cal-poly-slo');
 resolve({text:'<img src=x onerror=alert(1)>',mealIds:['t','nonexistent']});await new Promise(r=>setTimeout(r,0));
 assert.deepEqual(suggestions.mealIds,['t']);assert.equal(root.querySelectorAll('.assistant-meal').length,0);assert.equal(root.querySelector('img'),null);
 send();ui.reset();resolve({text:'OLD SESSION',mealIds:['c']});await new Promise(r=>setTimeout(r,0));
 assert.ok(!root.textContent.includes('OLD SESSION'));assert.equal(root.querySelectorAll('.assistant-meal').length,0);dom.window.close();
});
