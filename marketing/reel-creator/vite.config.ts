import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  server: {
    port: 5179,
    strictPort: true,
    host: true,
  },
  preview: {
    port: 5179,
    host: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
