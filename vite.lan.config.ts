import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: "src",
  configFile: false,
  plugins: [react()],
  server: { host: "127.0.0.1", port: 1420, strictPort: true },
  build: { outDir: "../dist-lan", emptyOutDir: true, rollupOptions: { input: "src/lan.html" } }
});
