import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@brand": path.resolve(__dirname, "../brand"),
      "framer-motion": path.resolve(__dirname, "node_modules/framer-motion"),
      react: path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
    },
    dedupe: ["react", "react-dom", "framer-motion"],
  },
  server: {
    port: 5179,
    fs: {
      allow: [path.resolve(__dirname, "..")],
    },
  },
  publicDir: "public",
});
