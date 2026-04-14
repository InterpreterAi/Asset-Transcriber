import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const isProduction = process.env.NODE_ENV === "production";

const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 3000;

if (!isProduction) {
  if (!rawPort) {
    throw new Error(
      "PORT environment variable is required but was not provided.",
    );
  }
  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }
}

const basePath = process.env.BASE_PATH ?? "/";

// API server defaults to 8787 in development (see artifacts/api-server server-entry). Replit uses PORT=8080 — set VITE_API_ORIGIN=http://127.0.0.1:8080 there if needed.
const apiProxyTarget =
  process.env.VITE_API_ORIGIN ?? `http://127.0.0.1:${process.env.API_SERVER_PORT ?? "8787"}`;

export default defineConfig({
  base: basePath,
  /** Strip console/debugger from production bundles — nothing in DevTools for users. */
  esbuild: {
    drop: isProduction ? (["console", "debugger"] as const) : [],
  },
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
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
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
