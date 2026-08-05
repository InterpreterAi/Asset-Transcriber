import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../../../docs/creative-studio-screenshots");
fs.mkdirSync(outDir, { recursive: true });

const base = process.env.STUDIO_URL || "http://127.0.0.1:5179/";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1100 },
  deviceScaleFactor: 2,
});

async function shot(name) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log("wrote", file);
}

await page.goto(base, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await shot("01-campaign");

await page.getByRole("button", { name: /Interpreters/i }).first().click();
await page.waitForTimeout(500);
await shot("02-template");

await page.getByRole("button", { name: /30s Commercial/i }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: /Generate storyboard/i }).click();
await page.waitForTimeout(400);
await shot("03-generate");

await page.getByRole("button", { name: /Generate video/i }).waitFor({ timeout: 20000 });
await page.waitForTimeout(700);
await shot("04-review");

await page.getByRole("button", { name: /Still typing|Focus splits|Live words|Hours back/i }).first().click().catch(() => {});
await page.waitForTimeout(400);
await shot("04b-review-scene-detail");

await page.getByRole("button", { name: /^Generate video$/i }).click();
await page.waitForTimeout(500);
await shot("05-generate-video");

await browser.close();
console.log("done");
