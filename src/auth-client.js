import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './public-config.js';
export const authClient = createClient(
  import.meta.env?.VITE_SUPABASE_URL || SUPABASE_URL,
  import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY || SUPABASE_PUBLISHABLE_KEY,
);
