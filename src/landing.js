// Legacy auth redirects must reach the page that initializes the auth client.
const hash = new URLSearchParams(location.hash.slice(1));
const query = new URLSearchParams(location.search);
if (hash.has("access_token") || hash.has("error_description") || query.has("code") || query.has("error_description")) {
  location.replace(new URL("./app.html", location.href).pathname + location.search + location.hash);
}

// Reflect the same signed-in account in the shared marketing header.
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./public-config.js";
const client = createClient(import.meta.env.VITE_SUPABASE_URL || SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || SUPABASE_PUBLISHABLE_KEY);
client.auth.getSession().then(({ data }) => {
  if (data.session) document.querySelector("#account-button").textContent = "Your account →";
});
