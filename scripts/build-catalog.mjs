import {writeFileSync} from 'node:fs';
import {SCHOOLS} from '../src/model.js';
globalThis.window={};
await import('../data/meals.js');await import('../data/meal-ideas.js');
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
const sql=`-- Generated from the verified menu export and derived meal ideas. Rebuild with npm run catalog.\ninsert into public.schools(id,name,menus) values\n${SCHOOLS.map(s=>`(${quote(s.id)},${quote(s.name)},${s.menus})`).join(',\n')}\non conflict(id) do update set name=excluded.name,menus=excluded.menus;\ninsert into public.meal_catalog(id,school_id,snapshot) values\n${window.MEALS.map(m=>`(${quote(m.id)},'cal-poly-slo',${quote(JSON.stringify(m))}::jsonb)`).join(',\n')}\non conflict(id) do update set snapshot=excluded.snapshot;\n`;
writeFileSync(new URL('../supabase/migrations/202611140002_catalog.sql',import.meta.url),sql);
console.log(`Generated catalog: ${SCHOOLS.length} schools, ${window.MEALS.length} meals.`);
