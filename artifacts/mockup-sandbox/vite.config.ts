import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { mockupPreviewPlugin } from "./mockupPreviewPlugin";

const rawPort = process.env.PORT ?? "5000";
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";
const isProduction = process.env.NODE_ENV === "production";

const replitPlugins: PluginOption[] = [];
if (process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined) {
  const m = await import("@replit/vite-plugin-cartographer");
  replitPlugins.push(
    m.cartographer({
      root: path.resolve(import.meta.dirname, ".."),
    }),
  );
}

export default defineConfig({
  base: basePath,
  esbuild: {
    drop: isProduction ? (["console", "debugger"] as const) : [],
  },
  plugins: [
    mockupPreviewPlugin(),
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...replitPlugins,
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
