// Write scripts/deer.py's deer into src/lib/sprites/deer.json, keeping the file's palettes, the
// winter variant and the animations: node scripts/deer.mjs [--check]
// --check writes nothing and counts the pixels, in each colourway, where the drawing would differ
// from the file's.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

import { flattenSprite, fromJson, toJson } from "@anarkisti/dab/core";

const FILE = "src/lib/sprites/deer.json";
/** The far legs draw behind the body; the near ones over it. */
const ORDER = ["leg_hind_far", "leg_front_far", "leg_hind_near", "leg_front_near"];

const read = (text) => {
  const r = fromJson(text);
  if ("errors" in r) throw new Error(r.errors.join("\n"));
  return r.sprite;
};

const drawn = JSON.parse(execFileSync("python3", ["scripts/deer.py"], { encoding: "utf8" }));
const now = read(readFileSync(FILE, "utf8"));
const next = read(toJson(now));
next.frames = drawn.body;
next.parts = ORDER.map((name) => {
  const was = now.parts?.find((p) => p.name === name);
  if (!was) throw new Error(`${FILE} has no part ${name}`);
  const { x, y, w, h, frames } = drawn.parts[name];
  const part = { ...was, x, y, w, h, frames };
  if (name.endsWith("far")) part.behind = true;
  else delete part.behind;
  return part;
});
const text = toJson(next);

if (process.argv.includes("--check")) {
  const after = read(text);
  let differ = 0;
  for (const variant of [null, ...Object.keys(now.variants ?? {})]) {
    const a = flattenSprite(now, { variant });
    const b = flattenSprite(after, { variant });
    const cells = a.frames.flatMap((rows, f) =>
      rows.flatMap((row, y) => [...row].filter((ch, x) => ch !== b.frames[f]?.[y]?.[x])),
    );
    console.log(`${variant ?? "own colours"}: ${cells.length} pixels differ`);
    differ += cells.length;
  }
  process.exit(differ ? 1 : 0);
}
writeFileSync(FILE, text);
console.log(`wrote ${FILE}`);
