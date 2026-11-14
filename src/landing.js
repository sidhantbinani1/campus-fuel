// Legacy auth redirects must reach the page that initializes the auth client.
const hash = new URLSearchParams(location.hash.slice(1));
const query = new URLSearchParams(location.search);
if (hash.has("access_token") || hash.has("error_description") || query.has("code") || query.has("error_description")) {
  location.replace(new URL("./app.html", location.href).pathname + location.search + location.hash);
}
