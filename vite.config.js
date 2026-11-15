import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  server: { watch: { usePolling: true, interval: 300 } },
  build: { rollupOptions: { input: Object.fromEntries(
    ["index", "app", "demo", "contact", "admin"].map(name => [name, fileURLToPath(new URL(`./${name}.html`, import.meta.url))])
  ) } },
});
