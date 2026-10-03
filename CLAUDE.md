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
src/lib/office/      software specialist: engine (messages, desk, pay), tasks, days, drawing, week store
  wood/              friday's wood: garden (draw order) · seasons · wind · trees + sway (trees and
                     how they move) · shrubs, climbers, grass + sprawl + rustle (the soft plants
                     and how they move) · posed (draws both) · stand (the six trees, apples) ·
                     undergrowth (the shrubs) · overgrowth (cracks, grass, climbers) · moss ·
                     wall (the back wall coming down) · outside (the world behind it) ·
                     weather · life
src/lib/audio/       synthesized sound for both rooms, the mute
src/lib/scene/       shared: the winter window, shift clock, calendar, LED, pixel font, pixel helpers
src/lib/sprites/     dab-format sprite JSON for both rooms + a reader
src/lib/tape/        orientation cassette: mechanics (from scene), canvas drawing, script + cues
src/lib/components/  factory/ · office/ · intro/ · dev/ (dev bar, shuttle); shared signs and icons
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
  bird, drone) as functions of time; there is nothing to finish. The trees (`wood/trees.ts`:
  always an apple tree, plus five of birch, rowan, oak, maple, cherry, plum, spruce, pine,
  each grown the way the species grows) are generated from `mood.seed`, so each friday grows
  its own wood and a reload keeps it. Each slot (`wood/stand.ts`) keeps a tree for good: one
  lives a few years, dies in a spring and stands dead, goes over (its root plate with it) and
  rots into the floor while a sapling of another kind comes up; an apple tree's slot regrows
  an apple tree. In dev a shuttle under the room runs friday's clock
  ahead or back while held, faster the further it is pulled. Apples ripen, fall
  through the autumn and lie until the snow; a tap on the apple tree shakes the next one down
  early (`mood.knocks`), the one thing on friday that answers the player. The wind
  (`wood/wind.ts`) is a function of time too: a mean by season, gusts that cross the room
  from the upwind side. Every tree moves by one simulation (`wood/sway.ts`): its wood is a
  rig of pieces hung off their parents, each turning about its base against its width cubed,
  and clumps, fruit and the owl ride the piece they hang on. The soft plants (shrubs,
  climbers, grass; `wood/sprawl.ts`) move by their own rules (`wood/rustle.ts`): no skeleton,
  each stem a whippy rod (a climber's clings to the wall), waves running across them, leaves
  turning over in a stiff wind. Climbers grow by reaching, not swelling; the hop dies back each
  winter. Both answer the wind's history through the same damped
  spring (`springOf`), and both are painted once into pixel lists and re-posed each frame
  (`wood/posed.ts`). Leaves and snow ride the wind's integral (`driftOf`); grass, the
  window's rain and a sound bed follow it. The back wall is a wall of pieces
  (`wood/wall.ts`): loosened from where the roof fell, they break away at the blast and for
  years after, fall and land at its foot, and moss over and sink into the floor; what hangs on
  the wall (window, clock, calendar, signs) goes with the piece above it, and the signs'
  buttons follow. The gaps and the window look out on one world (`wood/outside.ts`), ruined
  at the blast and healing over the years. Friday has days (`wood/daylight.ts`, a minute
  each): the season sets how long the sun is up and how high it climbs, how dark the night
  gets; the moon crosses the nights through its phases. Night shades the wood as well as the
  room; the outside keeps its own light, and fireflies, the clock and the signs on the wall
  stay lit.
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
In dev, a bar under every page jumps between days, holds friday's shuttle and opens
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
