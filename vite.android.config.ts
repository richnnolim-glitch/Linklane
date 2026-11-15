import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: "src",
  base: "./",
  configFile: false,
  plugins: [react()],
  build: {
    outDir: "../android/app/src/main/assets/linklane",
    emptyOutDir: true,
    rollupOptions: { input: "lan-android.html" }
  }
});
