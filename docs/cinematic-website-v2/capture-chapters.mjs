#!/usr/bin/env node
/**
 * Capture all 9 cinematic chapter states for design review.
 * Usage: node docs/cinematic-website-v2/capture-chapters.mjs
 * Requires: npm run build && npx playwright install chromium
 */
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const APP = path.join(ROOT, "artifacts/transcription-app");
const OUT = path.join(__dirname, "preview-screenshots");
const PORT = 4173;
const BASE = `http://127.0.0.1:${PORT}/`;

const CHAPTERS = [
  { id: "01-problem", progress: 0.06, label: "Ch1 The Problem" },
  { id: "02-conversation", progress: 0.2, label: "Ch2 The Conversation" },
  { id: "03-interpreterai", progress: 0.33, label: "Ch3 InterpreterAI" },
  { id: "04-languages", progress: 0.43, label: "Ch4 Languages" },
  { id: "05-uses", progress: 0.53, label: "Ch5 Real-World Uses" },
  { id: "06-trust", progress: 0.63, label: "Ch6 Trust" },
  { id: "07-scale", progress: 0.73, label: "Ch7 Scale" },
  { id: "08-pricing", progress: 0.84, label: "Ch8 Pricing" },
  { id: "09-finale", progress: 0.96, label: "Ch9 Final Moment" },
];

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function waitForServer(ms = 12000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("Preview server did not start");
}

async function main() {
  await mkdir(OUT, { recursive: true });

  console.log("Building app…");
  await run("npm", ["run", "build"], APP);

  console.log("Starting preview server…");
  const preview = spawn("npm", ["run", "serve", "--", "--port", String(PORT)], {
    cwd: APP,
    stdio: "pipe",
    shell: process.platform === "win32",
  });

  try {
    await waitForServer();

    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE, { waitUntil: "networkidle" });

    for (const ch of CHAPTERS) {
      await page.evaluate((progress) => {
        const scroller = document.getElementById("app-scroll") ?? document.documentElement;
        const track = document.getElementById("cinematic-scroll-track");
        const max = track
          ? track.offsetHeight - scroller.clientHeight
          : scroller.scrollHeight - scroller.clientHeight;
        scroller.scrollTop = Math.max(0, max * progress);
      }, ch.progress);
      await page.waitForTimeout(600);
      const file = path.join(OUT, `${ch.id}.png`);
      await page.screenshot({ path: file, fullPage: false });
      console.log(`✓ ${ch.label} → ${file}`);
    }

    await browser.close();
    console.log(`\nAll chapter previews saved to:\n${OUT}`);
  } finally {
    preview.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
