import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "fs";
import { createRequire } from "module";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

function kuromojiDictDir(): string {
  const local = path.resolve(import.meta.dirname, "node_modules/kuromoji/dict");
  if (fs.existsSync(local)) return local;
  try {
    const require = createRequire(import.meta.url);
    return path.join(path.dirname(require.resolve("kuromoji/package.json")), "dict");
  } catch {
    return local;
  }
}

/** Serve kuromoji's gzip dictionary only when Romaji is turned on. Do not mark Content-Encoding: gzip — the browser loader inflates the bytes itself. */
function kuromojiDictPlugin(): Plugin {
  const src = kuromojiDictDir();
  const mount = (url: string | undefined): string | null => {
    if (!url) return null;
    const pathOnly = url.split("?")[0] ?? "";
    const marker = "/kuromoji-dict/";
    const at = pathOnly.indexOf(marker);
    if (at < 0) return null;
    const rel = decodeURIComponent(pathOnly.slice(at + marker.length));
    if (!rel || rel.includes("..")) return null;
    const file = path.join(src, rel);
    return file.startsWith(src) ? file : null;
  };
  return {
    name: "kuromoji-dict",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = mount(req.url);
        if (!file || !fs.existsSync(file)) return next();
        res.setHeader("Content-Type", "application/octet-stream");
        fs.createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      if (!fs.existsSync(src)) return;
      const dest = path.resolve(import.meta.dirname, "dist/public/kuromoji-dict");
      fs.mkdirSync(dest, { recursive: true });
      fs.cpSync(src, dest, { recursive: true });
    },
  };
}

const isProduction = process.env.NODE_ENV === "production";
/** Set `VITE_KEEP_CONSOLE=1` on the build machine to retain console.* in production bundles (debug only). */
const keepConsole = process.env.VITE_KEEP_CONSOLE === "1";

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
  /** Strip console/debugger from production bundles unless VITE_KEEP_CONSOLE=1 */
  esbuild: {
    drop:
      isProduction && !keepConsole
        ? (["console", "debugger"] as const)
        : ([] as ("console" | "debugger")[]),
    legalComments: isProduction ? "none" : "inline",
  },
  plugins: [
    react(),
    tailwindcss(),
    kuromojiDictPlugin(),
    ...(isProduction ? [] : [runtimeErrorOverlay()]),
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
      "kuromoji/src/loader/NodeDictionaryLoader.js": path.resolve(
        kuromojiDictDir(),
        "..",
        "src/loader/BrowserDictionaryLoader.js",
      ),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    /** No browser source maps in production — avoids leaking TS/React structure. */
    sourcemap: isProduction ? false : true,
    minify: isProduction ? "terser" : true,
    terserOptions: isProduction
      ? {
          compress: {
            passes: 2,
            ecma: 2022,
            pure_getters: true,
            unsafe: false,
            drop_debugger: true,
            ...(keepConsole
              ? {}
              : {
                  pure_funcs: [
                    "console.log",
                    "console.info",
                    "console.debug",
                    "console.trace",
                    "console.warn",
                    "console.error",
                  ],
                }),
          },
          mangle: {
            safari10: true,
          },
          format: {
            comments: false,
          },
        }
      : {},
    rollupOptions: {
      output: isProduction
        ? {
            /** Hash-only filenames — harder to guess roles (e.g. websocket vs translate). */
            chunkFileNames: "assets/[hash].js",
            entryFileNames: "assets/[hash].js",
            assetFileNames: "assets/[hash][extname]",
            manualChunks(id) {
              if (id.includes("node_modules")) {
                if (id.includes("kuromoji")) return "kuromoji";
                return "v";
              }
            },
          }
        : {},
    },
    chunkSizeWarningLimit: 900,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
      allow: [
        path.resolve(import.meta.dirname),
        path.resolve(import.meta.dirname, "..", "..", "marketing"),
      ],
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
