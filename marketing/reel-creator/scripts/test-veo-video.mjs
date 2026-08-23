#!/usr/bin/env node
/** Simulates HookFootagePreview blob load for Veo cache URLs. */
import { chromium } from "playwright";

const url =
  process.env.TEST_URL ??
  "http://127.0.0.1:5179/api/reel-builder/footage/veo-862b09a0e6363d38.mp4";
const origin = process.env.ORIGIN ?? "http://127.0.0.1:5179";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(origin + "/", { waitUntil: "domcontentloaded" });

const out = await page.evaluate(async (src) => {
  const res = await fetch(src);
  if (!res.ok) return { fetchOk: false, status: res.status };
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const v = document.createElement("video");
  v.src = objectUrl;
  v.muted = true;
  await new Promise((resolve, reject) => {
    v.onloadedmetadata = () => resolve(null);
    v.onerror = () => reject(v.error ?? new Error("video error"));
  });
  return {
    fetchOk: true,
    blobSize: blob.size,
    blobType: blob.type,
    duration: v.duration,
    readyState: v.readyState,
    videoWidth: v.videoWidth,
    videoHeight: v.videoHeight,
  };
}, url);

console.log("URL:", url);
console.log("Result:", JSON.stringify(out, null, 2));
await browser.close();
process.exit(out.fetchOk && out.duration > 0 ? 0 : 1);
