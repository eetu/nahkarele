# nahkarele — repo overview

Interactive nahkarele simulator: two jobs where the human is in the loop and changes nothing.
`/tehdas` (1978) is a rubber-boot conveyor where the player stamps defects and TÄ'h, the
tape-drive computer after them, re-checks every boot anyway. `/specialist` (2026) is a
software specialist at a desk between AI #1 and AI #2, approving messages the AIs act on
regardless, until a brain in a jar takes the desk. A static SvelteKit SPA served by nginx. Siblings: `../logo` (same container
shape), `../dice` (same SvelteKit stack), `eetu/scene` (origin of `src/lib/tape/cassette.ts`).

## Layout

```
src/lib/factory/     kumitehdas: engine (belt, gate, TÄ'h, floor bots), days, drawing, week store
src/lib/office/      software specialist: engine (messages, desk, pay), tasks, days, drawing, friday's wood (forest.ts), week store
src/lib/audio/       synthesized sound for both rooms, the mute
src/lib/scene/       shared: the winter window (sky, weather, blast, cracks) and the shift clock
src/lib/sprites/     dab-format sprite JSON for both rooms + a reader
src/lib/tape/        orientation cassette: mechanics (from scene), canvas drawing, script + cues
src/lib/components/  Intro · FactoryStage + Memo/DayReview/WeekReview · OfficeStage + DeskPanel/Payslip
src/routes/          / (front page) · /tehdas · /specialist · /workbench (dev only)
static/              favicon.svg (icon source) + generated PNGs + manifest
default.conf         nginx: SPA fallback, immutable caching for /_app/immutable
docker/              optional Liwan tracker entrypoint (same as logo)
```

## Conventions

- **Output never depends on the player.** In the factory, the boots come from one seeded
  stream that draws the same randoms per boot whatever happens; tipping uses a second
  stream; a day is a fixed number of boots, not a clock. The engine test runs idle,
  perfect, contrarian and slow players and asserts identical shipped/rejected counts —
  keep it passing, it is the joke.
- **The grade is still on correctness** (Finnish school grade 4–10 from stamp F1). Dropped
  defects count as misses.
- **Don't tell the player TÄ'h corrects them.** Memos and HUD never say so; the x-ray readout,
  sparkles and the review's "shipped without you" reveal it.
- **Sprites are dab files** (github.com/eetu/dab): edit them there, `sprite.ts` only reads.
  Defects are frames or variants of their model's sprite (`MODEL_DEFECTS` in `days.ts`);
  `xray` is a palette variant. Thursday adds phones; Friday is phones only and a boot is
  `foreign`, always defective.
- **In the office, every message is delivered.** The AIs send tokens on a schedule; they pile
  in the tray (max `DESK_CAPACITY`), overflow or slide onto the floor, and the drone carries
  those to the receiver. An answer only moves the accuracy bonus. Salary is time on shift.
  The office test runs idle, right, wrong and slow players against the same seed.
- **The rooms have no header.** Numbers and switches live in the scene: a wall calendar for
  the day and the count, TÄ'h's readout and the shredder/crate counters, the office pay under
  the clock, and `SceneSign` buttons over sprites for EXIT, WC, sound and fullscreen. In-scene
  text uses the 5x7 face in `scene/pixelfont.ts` (ASCII plus a euro sign).
- **Cards are pixel frames.** Memos, reviews, the payslip, the desk and the diff use
  `.pixel-card` (`styles/pixel.css`: 9-slice SVG tiles, Pixelify Sans); one frame pixel is
  `--px`, which each stage sets to its scene pixel. The paper is the same in both themes, so
  the card pins the halo tokens it draws with. `.pixel-notch` cuts pixel corners.
- **A toilet break hands the job to the machines.** The WC sign on the wall (or `w`) starts and
  ends it. `setAway` opens the factory gate (TÄ'h
  decides, correctly) or sends office tokens AI to AI; the stage runs time 3×. Whatever is
  handled away is `automated`, outside the grade and the accuracy; a day with no decisions
  of your own grades 4.
- **Engines are pure and stepped by the frame loop** (`step(state, dt)`); the week stores are
  the only reactive layer, copying a few numbers into `hud`. Keep rules in the engine so
  vitest covers them without a DOM.
- **Sound is synthesized** (`src/lib/audio/sfx.svelte.ts`, Web Audio, no assets, as in
  `../dice`). Engines push what can be heard onto `state.events`; the stage drains it each
  frame and plays it. Nothing audible feeds back into the engine.
- **Friday in the office is a loop, not a day.** `mood.since` drives everything (grass, vines,
  bird, drone) as functions of time; there is nothing to finish. The trees (`office/trees.ts`:
  always an apple tree, plus five of birch, rowan, oak, maple, cherry, plum, spruce, pine,
  each grown the way the species grows) are generated from `mood.seed`, so each friday grows
  its own wood and a reload keeps it. In dev a scrubber under the room runs friday's clock
  at any speed, backwards too. Apples ripen, fall
  through the autumn and lie until the snow; a tap on the apple tree shakes the next one down
  early (`mood.knocks`), the one thing on friday that answers the player. The wind
  (`office/wind.ts`) is a function of time too: a mean by season, gusts that cross the room
  from the upwind side. Every tree moves by one simulation (`office/sway.ts`): its wood is a
  rig of pieces hung off their parents, each turning about its base against its width cubed,
  and clumps, fruit and the owl ride the piece they hang on; a tree is painted once into
  pixel lists and re-posed each frame. Leaves and snow ride the wind's integral (`driftOf`);
  grass, the window's rain and a sound bed follow it.
- **Scene pieces draw themselves.** A tree, a sprite, the calendar, pixel text: a draw function
  over a canvas context and plain values, no DOM. That is what lets the workbench show them
  alone; keep new pieces that way.
- **The cassette canvas animates only while something moves.** The factory canvas runs every
  frame while mounted: the line keeps running between shifts, which is the point.
- Voice: lowercase, dry, numbers do the talking. The AIs' messages are the exception: they
  speak in sentence case, like machines that were trained on memos.

## Working on this repo

`yarn dev` (:5173; on `/tehdas` and `/specialist` Shift + 1–5 jumps to that day, dev
builds only) ·
`yarn validate` (typecheck, lint, format, test) · `yarn build` → `dist/`.
In dev, a bar under every page jumps between days, holds friday's scrubber and opens
`/workbench` (so does the key left of 1, backquote): each unit drawn alone with live
controls, `g` for a grid of seeds, `[` `]` between units; a unit with `tap` answers clicks
(the wood: shake the apple tree). A unit is a small adapter in
`src/routes/workbench/units.ts` over a draw function in `$lib`; production builds answer 404.
`./install-hooks.sh` once after clone; the pre-commit hook runs `validate`. Icons: edit
`static/favicon.svg`, then `scripts/gen-icons.sh` (needs librsvg + ImageMagick). Tape: edit
`src/lib/tape/orientation.json`, then `uv run scripts/gen-tape.py` (Piper on mini, ffmpeg); it
re-sings each line on held notes and writes `static/tape/orientation.mp3` + `tape.json` cues.
Link card: `yarn dev`, then `SITE=http://localhost:5173 node scripts/gen-og.mjs` (borrows a
playwright install, see the script) captures both rooms into `static/og.jpg`.

## Out of scope

No backend, no accounts, no leaderboard, no real LLM calls: the AIs are scripted on purpose.
