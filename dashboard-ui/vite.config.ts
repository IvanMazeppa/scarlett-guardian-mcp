import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// Served by Guardian at /dashboard (auth-gated). Relative API paths work via ngrok.
export default defineConfig({
  plugins: [react()],
  base: "/dashboard/",
  build: {
    outDir: path.resolve(rootDir, "../public/dashboard-app"),
    emptyOutDir: true,
    sourcemap: true
  },
  server: {
    port: 5179,
    proxy: {
      "/telemetry": "http://127.0.0.1:8790",
      "/control": "http://127.0.0.1:8790",
      "/health": "http://127.0.0.1:8790"
    }
  }
});
