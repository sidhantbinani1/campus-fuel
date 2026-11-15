import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {createAccount} from '../src/account.js';
const read=name=>readFileSync(new URL(`../${name}`,import.meta.url),'utf8');

test('university links open the requested student feature for guests',async()=>{
 const marketing=new JSDOM(read('index.html'),{url:'http://localhost/index.html'});
 const tabs=[...marketing.window.document.querySelectorAll('body > .site-header .app-tab')];
 assert.equal(tabs.length,4);
 for(const tab of tabs){
  const destination=new URL(tab.href);
  assert.equal(destination.pathname,'/app.html');
  const dom=new JSDOM(read('app.html'),{url:destination.href});
  for(const key of ['window','document','location','localStorage','sessionStorage'])globalThis[key]=dom.window[key];
  let change,actualView;
  const client={auth:{onAuthStateChange(fn){change=fn;}},rpc(){throw new Error('Guest navigation must not read account records');}};
  createAccount({snapshot:()=>({goals:{},entries:[],dailyGoals:{}}),replace(){},navigate(view){actualView=view;},refresh(){},message(){},nutrients:[],meals:[]},{client});
  change('SIGNED_OUT',null);
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(actualView,destination.searchParams.get('view'));
  assert.equal(document.body.classList.contains('campus-branded'),false);
  dom.window.close();
 }
 marketing.window.close();
 for(const key of ['window','document','location','localStorage','sessionStorage'])delete globalThis[key];
});

test('eight-slide overview keeps arrow controls, deep links and inquiry destination without capturing header keys',()=>{
 const dom=new JSDOM(read('demo.html'),{url:'http://localhost/demo.html#slide-6',runScripts:'outside-only'});
 const w=dom.window;
 for(const script of w.document.querySelectorAll('script:not([src])'))w.eval(script.textContent);
 const counter=()=>w.document.getElementById('counter').textContent;
 assert.equal(w.document.querySelectorAll('.slide').length,8);
 assert.equal(counter(),'06 / 08');
 w.document.getElementById('next').click();assert.equal(counter(),'07 / 08');
 w.document.body.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(counter(),'08 / 08');
 const inquiry=w.document.querySelector('.slide.next .cta');assert.equal(new URL(inquiry.href).pathname,'/contact.html');assert.equal(inquiry.target,'_top');
 const studentLink=w.document.querySelector('.audience-nav a:last-child');
 studentLink.dispatchEvent(new w.KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true}));assert.equal(counter(),'08 / 08');
 w.document.getElementById('next').click();assert.equal(counter(),'01 / 08');
 w.document.getElementById('prev').click();assert.equal(counter(),'08 / 08');
 dom.window.close();
});
