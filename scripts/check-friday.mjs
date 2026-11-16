// Friday found again from its cookie alone: with localStorage gone (Safari clears it after seven
// days away), a visitor arriving at the front page lands in friday, in the same wood; EXIT
// forgets it. Also holds /friday to what default.conf answers.
//
//   yarn build && node scripts/check-friday.mjs
//
// Serves dist/ with /friday answered as default.conf answers it; SITE checks a running server
// instead (the container: SITE=http://localhost:8080). PLAYWRIGHT as in gen-og.mjs.

import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const PLAYWRIGHT = path.resolve(
  ROOT,
  process.env.PLAYWRIGHT ?? "../dice/frontend/node_modules/playwright",
);
const pw = createRequire(import.meta.url)(PLAYWRIGHT);

/** localStorage's key for friday's start (`office/week.svelte.ts`). */
const KEY = "nahkarele:specialist:friday";
/** The page's clock, held; friday began AWAY days before it (default 8, past Safari's seven). */
const NOW = Date.parse("2026-11-16T12:00:00Z");
const AT = NOW - Number(process.env.AWAY ?? 8) * 86_400_000;
const KEEP = `friday=${AT}; Path=/; Max-Age=34560000; SameSite=Lax; Secure`;
const FORGET = "friday=; Path=/; Max-Age=0; SameSite=Lax; Secure";

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".mp3": "audio/mpeg",
  ".txt": "text/plain",
  ".webmanifest": "application/manifest+json",
};

/** `/friday` as default.conf answers it, on the raw query as nginx's `$arg_at` reads it. */
const friday = (url, res) => {
  const at = /[?&]at=([^&]*)/.exec(url)?.[1] ?? "";
  if (/^[0-9]{10,13}$/.test(at)) {
    res.writeHead(204, {
      "Set-Cookie": `friday=${at}; Path=/; Max-Age=34560000; SameSite=Lax; Secure`,
      "Cache-Control": "no-store",
    });
  } else if (at !== "") res.writeHead(400);
  else res.writeHead(204, { "Set-Cookie": FORGET, "Cache-Control": "no-store" });
  res.end();
};

/** dist/ with the app shell for every path that is not a file. */
const serve = async (req, res) => {
  const url = req.url ?? "/";
  if (url === "/friday" || url.startsWith("/friday?")) return friday(url, res);
  const want = path.join(DIST, decodeURIComponent(url.split("?")[0]));
  const found = want.startsWith(DIST + path.sep) && (await stat(want).catch(() => null))?.isFile();
  const file = found ? want : path.join(DIST, "index.html");
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  res.end(await readFile(file));
};

const fail = (what) => {
  console.error(`✗ ${what}`);
  process.exitCode = 1;
};
const check = (ok, what) => (ok ? console.log(`✓ ${what}`) : fail(what));

let server = null;
let site = process.env.SITE?.replace(/\/$/, "");
if (!site) {
  server = createServer((req, res) => void serve(req, res));
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  site = `http://localhost:${server.address().port}`;
}
console.log(`checking ${site}${server ? " (dist/, /friday stubbed)" : ""}`);

// What /friday answers, and what it never puts in a header.
const ask = (q) => fetch(`${site}/friday${q}`, { redirect: "manual" });
let res = await ask(`?at=${AT}`);
check(res.status === 204 && res.headers.get("set-cookie") === KEEP, "?at= keeps it");
res = await ask("");
check(res.status === 204 && res.headers.get("set-cookie") === FORGET, "no at forgets it");
for (const q of ["?at=12345", `?at=${AT};Domain=example.org`, `?at=${AT}%0d%0aX-Evil:%201`]) {
  res = await ask(q);
  check(res.status === 400 && res.headers.get("set-cookie") === null, `${q} refused`);
}

const browser = await pw.chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
// The frame that catches the world up holds the page for a while.
page.setDefaultTimeout(300_000);
await page.clock.setFixedTime(NOW);

/** The room's live picture: with the clock held, once caught up and the note over the catch-up
 *  down, it is the same frame after frame. */
const live = async () => {
  const t0 = performance.now();
  let last = null;
  for (let i = 0; i < 240; i++) {
    await page.waitForTimeout(500);
    const shot = await page.locator(".viewport").screenshot();
    if (last?.equals(shot) && (await page.locator("canvas.note").isHidden())) {
      console.log(`  live after ${((performance.now() - t0) / 1000).toFixed(1)} s`);
      return shot;
    }
    last = shot;
  }
  throw new Error("the room never held still");
};
const inFriday = async () =>
  (await page.locator("dl.sr-only dd").first().textContent()) === "friday" &&
  (await page.getByRole("button", { name: "clock in" }).count()) === 0;
const kept = () => page.waitForResponse((r) => r.url() === `${site}/friday?at=${AT}`);
const cookie = async () => (await context.cookies(site)).find((c) => c.name === "friday")?.value;

// Friday in localStorage alone, as kept before the cookie: its page keeps it in the cookie too.
await page.goto(`${site}/robots.txt`);
await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, String(AT)]);
let renewed = kept();
await page.goto(`${site}/specialist`);
await renewed;
check(await inFriday(), "friday from localStorage");
check((await cookie()) === String(AT), "its start in the cookie");
const before = await live();

// Safari clears localStorage; the visitor comes back to the front page.
await page.evaluate(() => localStorage.clear());
renewed = kept();
await page.goto(`${site}/`);
await renewed;
check(new URL(page.url()).pathname === "/specialist", "the front page goes straight to friday");
check(await inFriday(), "friday from the cookie alone");
const back = await page.evaluate((k) => localStorage.getItem(k), KEY);
check(back === String(AT), "the same start, so the same seed, back in localStorage");
check((await live()).equals(before), "the same wood, pixel for pixel");

// EXIT forgets it: the front page, and a reload stays there.
const forgot = page.waitForResponse((r) => r.url() === `${site}/friday`);
await page.getByRole("link", { name: "exit" }).click();
await forgot;
await page.waitForURL(`${site}/`);
check((await cookie()) === undefined, "EXIT forgets the cookie");
await page.reload();
check(new URL(page.url()).pathname === "/", "the front page stays after EXIT");

await browser.close();
server?.close();
