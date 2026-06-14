import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      "/api": "http://localhost:8080",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        // Headless STL generation harness (see scripts/generate_all_stl.mjs).
        headless: fileURLToPath(new URL("./headless.html", import.meta.url)),
      },
    },
  },
});
