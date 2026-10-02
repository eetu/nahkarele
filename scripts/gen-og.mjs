// Render static/og.jpg, the 1200×630 link-preview card: the glyph and the definition on
// the left, both rooms mid-shift on the right, captured live from a running dev server.
//
//   yarn dev &  node scripts/gen-og.mjs
//
// SITE picks the server (default :5173); PLAYWRIGHT a playwright install to borrow (the
// repo carries none; default ../dice/frontend/node_modules/playwright).

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = process.env.SITE ?? "http://localhost:5173";
const PLAYWRIGHT = path.resolve(
  ROOT,
  process.env.PLAYWRIGHT ?? "../dice/frontend/node_modules/playwright",
);
const OUT = path.join(ROOT, "static/og.jpg");

const pw = createRequire(import.meta.url)(PLAYWRIGHT);

const font = (pkg, file) =>
  `file://${path.join(ROOT, "node_modules/@fontsource", pkg, "files", file)}`;

/** The favicon's gear, lifted off its dark tile and inked for a pale card. */
const glyph = () =>
  readFileSync(path.join(ROOT, "static/favicon.svg"), "utf8")
    .replace(/<rect[^>]*\/>/, "")
    .replaceAll("#ededed", "#4a4a4a");

/** One room, clocked in and a few seconds along, as a PNG data URL. */
const capture = async (browser, route, settle) => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(SITE + route);
  await page.getByRole("button", { name: "clock in" }).click();
  await page.waitForTimeout(settle);
  const png = await page.locator(".viewport").screenshot();
  await page.close();
  return `data:image/png;base64,${png.toString("base64")}`;
};

const card = (factory, office) => `<!doctype html>
<meta charset="utf-8">
<style>
  @font-face { font-family: Inter; font-weight: 500; src: url("${font("inter", "inter-latin-500-normal.woff2")}"); }
  @font-face { font-family: Inter; font-weight: 600; src: url("${font("inter", "inter-latin-600-normal.woff2")}"); }
  @font-face { font-family: "Space Grotesk"; font-weight: 400; src: url("${font("space-grotesk", "space-grotesk-latin-400-normal.woff2")}"); }
  @font-face { font-family: "Space Grotesk"; font-weight: 500; src: url("${font("space-grotesk", "space-grotesk-latin-500-normal.woff2")}"); }
  html, body { margin: 0; }
  body {
    width: 1200px; height: 630px; display: flex; align-items: center; gap: 48px;
    padding: 0 48px; box-sizing: border-box; background: #f0f0f0; color: #4a4a4a;
    font-family: Inter, sans-serif; -webkit-font-smoothing: antialiased;
  }
  .text { flex: 1; }
  .glyph { width: 88px; height: 88px; margin-bottom: 36px; }
  h1 { margin: 0 0 6px; font-size: 84px; font-weight: 600; letter-spacing: -0.03em; line-height: 1; }
  h1 span { color: #f78f08; }
  .label { font-family: "Space Grotesk", sans-serif; font-size: 16px; color: #8a8a8a; letter-spacing: 0.04em; }
  .def { margin: 14px 0 32px; font-size: 25px; font-weight: 500; line-height: 1.35; }
  .modes { font-family: "Space Grotesk", sans-serif; font-size: 20px; color: #6e6e6e; line-height: 1.5; }
  .rooms { display: flex; flex-direction: column; gap: 14px; }
  .rooms img { width: 480px; height: 270px; border-radius: 8px; box-shadow: 0 6px 24px rgb(0 0 0 / 18%); display: block; }
</style>
<body>
  <div class="text">
    <div class="glyph">${glyph()}</div>
    <h1>nahkarele<span>.</span></h1>
    <div class="label">fi. noun</div>
    <p class="def">a person placed inside an automated process to pass along what the machine already knows.</p>
    <div class="modes">1978 · rubber boots inspector<br>2026 · software specialist</div>
  </div>
  <div class="rooms">
    <img src="${factory}" alt="">
    <img src="${office}" alt="">
  </div>
</body>`;

const browser = await pw.chromium.launch();
const factory = await capture(browser, "/tehdas", 3500);
const office = await capture(browser, "/specialist", 2500);
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
await page.setContent(card(factory, office));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(200);
await page.screenshot({ path: OUT, type: "jpeg", quality: 88 });
await browser.close();
console.log(`wrote ${path.relative(ROOT, OUT)}`);
