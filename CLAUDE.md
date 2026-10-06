# nahkarele — repo overview

Interactive nahkarele simulator: two jobs where the human is in the loop and changes nothing.
`/tehdas` (1978) is a rubber-boot conveyor where the player stamps defects and TÄ'h, the
tape-drive computer after them, re-checks every boot anyway. `/specialist` (2026) is a
software specialist at a desk between AI #1 and AI #2, approving messages the AIs act on
regardless, until a brain in a jar takes the desk. A static SvelteKit SPA served by nginx. Siblings: `../logo` (same container
shape), `../dice` (same SvelteKit stack), `eetu/scene` (origin of `src/lib/tape/cassette.ts`),
`../korpi` (`@anarkisti/korpi`, the world kit friday's pieces are moving into) and `../dab`
(`@anarkisti/dab`: the sprite editor, and `/core`, which reads the sprites), both linked with
`portal:` until they are published.

## Layout

```
src/lib/factory/     kumitehdas: engine (belt, gate, TÄ'h, floor bots), days, drawing, week store
src/lib/office/      software specialist: engine (messages, desk, pay), tasks, days, drawing, depth
                     (the room's view and depths), week store
  wood/              friday's wood, the room's side of korpi `plants` (what grows, how it moves
                     and is painted): garden (draw order) · seasons · wind ·
                     stand (the six slots, lanes, the apple tree's tap) · shedding (where dead
                     branches come to rest, a stick painted) · undergrowth (the shrubs) ·
                     overgrowth (cracks, grass, climbers) · meadow (the flowers' spots) ·
                     moss · posed (the soft plants' paintings) ·
                     wall (the back wall coming down; korpi paints it) · outside (the world
                     behind it) ·
                     weather · life · tit, crow, swallows (the birds)
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
- **Sprites are dab files** (github.com/eetu/dab): edit them there. `@anarkisti/dab/core`
  reads them (the walk dab draws an assembly in, a grid's pixels); `sprite.ts` paints them
  through a pen (korpi `sprites`, runs of a colour), or onto a canvas for the factory.
  They are written as dab writes them and kept out of Prettier. Every sprite is drawn at its
  own size, one sprite pixel to a scene pixel: a bigger animal is a bigger drawing.
  A sprite may carry parts (the deer's four legs): `drawSprite` draws them where dab places
  them, in dab's order, each at the sprite's frame — a part lifted out of a drawing in dab
  has the drawing's frames, so it walks with it. A part can then be redrawn on its own.
  Defects are frames or variants of their model's sprite (`MODEL_DEFECTS` in `days.ts`);
  `xray` is a palette variant. Thursday adds phones; Friday is phones only and a boot is
  `foreign`, always defective.
- **In the office, every message is delivered.** The AIs send tokens on a schedule; they pile
  in the tray (max `DESK_CAPACITY`), overflow or slide onto the floor, and the drone carries
  those to the receiver. An answer only moves the accuracy bonus. Salary is time on shift.
  The office test runs idle, right, wrong and slow players against the same seed.
- **The rooms have no header.** Numbers and switches live in the scene: a wall calendar for
  the day and the count, TÄ'h's readout and the shredder/crate counters, the office pay under
  the clock, and `SceneSign` buttons over sprites for EXIT, WC, sound and fullscreen. EXIT is
  the way out of friday too, so it never leaves the scene. Fullscreen is the room alone on
  black. In-scene text uses the 5x7 face in `scene/pixelfont.ts` (ASCII plus a euro sign).
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
  bird, drone) as functions of time; there is nothing to finish. The trees (always an apple
  tree, plus five of birch, rowan, oak, maple, cherry, plum, spruce, pine) are generated from
  `mood.seed`, so each friday grows its own wood and a reload keeps it. Trees are at the room's
  scale (40 px to the metre, the desk's) and grow as trees do (korpi `plants`, `growth`): a tree's
  whole life is laid down once from its seed, stems gaining height and girth year by year,
  branches sprouting from each year's growth, the crown rising and what it leaves below dying
  and dropping (`shedding`); `planAt` reads a plan off it at any age. The first wood
  comes in five years old in a few minutes, then grows a year a friday year, past the top of
  the room. Each slot (`wood/stand.ts`) keeps a tree for good: one lives its kind's years (a
  few friday hours), dies in a spring and stands dead, goes over (its root plate with it) and
  rots into the floor while a sapling of another kind comes up; an apple tree's slot regrows
  an apple tree. Old wood grows bracket fungi by its kind (`conks`): perennial conks
  (tinder fungus and chaga on birch, red-belted on conifers, false tinder, the plum's cushion)
  come in the last third of a tree's life, grow a band a year and stay on it dead and down;
  the sulphur shelf on old oak and the birch polypore on dead birch come in their season and
  wither. Each is painted with the piece of wood it grows on, so it sways, falls and rots
  with it. In dev a shuttle under the room runs friday's clock
  ahead or back while held, faster the further it is pulled. Apples ripen, fall
  through the autumn and lie until the snow; a tap on the apple tree shakes the next one down
  early (`mood.knocks`), and a tap on the back wall knocks out the block there (`mood.pokes`,
  baked into the masonry as a blow), the two things on friday that answer the player; both
  are kept through a reload. Flowers come up on the floor (korpi `flowers`, each kind on its
  own calendar, the ones that close at night closing; `wood/meadow.ts`): coltsfoot,
  dandelion and fireweed on the open floor after the blast, oxeye and harebell once it has
  settled, and wood anemone, lily of the valley and wood sorrel as the crowns close over; a
  fallen tree's gap brings the pioneers back. Which kind holds a spot is decided a year at a
  time under the snow, from the shade the stand casts. The birds keep the
  year and the day: the great tit stays the winter (fluffed up), sings in spring and brings a
  fledgling in summer; barn swallows come in late spring, nest on AI #1 and leave in early
  autumn; a hooded crow struts, caws from the broken wall, takes fallen apples and scares the
  tit off the jar. All of them sleep the nights, and so does the drone: at the first dusk a
  solar charger comes up out of the box on the desk (`office/charger.ts`), its panel turning
  to the sun by day, and the drone sleeps on it every night. The wind
  (`wood/wind.ts`) is a function of time too: a mean by season, gusts that cross the room
  from the upwind side. Every tree moves by one simulation (korpi `sway`): its wood is a
  rig of pieces hung off their parents, each turning about its base against its width cubed,
  and clumps, fruit and the owl ride the piece they hang on. The soft plants (shrubs,
  climbers, flowers, grass; korpi `sprawl`) move by their own rules (`rustle`): no skeleton,
  each stem a whippy rod (a climber's clings to the wall), waves running across them, leaves
  turning over in a stiff wind. Climbers grow by reaching, not swelling; the hop dies back each
  winter. Both answer the wind's history through the same damped spring (`springOf`), and
  both are painted once into pixel lists and re-posed each frame (korpi `posed`). The
  spider swings on its thread by the same spring, at a pendulum's pace for the thread's
  length. Leaves and snow ride the wind's integral (`driftOf`); grass, the
  window's rain and a sound bed follow it. The back wall is masonry (`@anarkisti/korpi/masonry`, the
  room's side in `wood/wall.ts`; korpi's painter paints it, each stone at its own depth): cement blocks laid in courses under plaster,
  baked once per seed into a timeline; the plaster comes off in patches over the years
  (soonest beside a gap) and shows the blocks. A block stands while its centre of mass is over its bed (or mortar holds it
  a little past, or the arch over a gap leans on it); the roof comes down at the blast and in
  its first years, blocks wear loose from the top and the gaps' edges (Weibull wear times
  exposure), and what loses its support comes down with them; part of the foot stands for
  good. A block tips out of the wall into the room (or outside, seen through the gaps),
  tumbles at real gravity, may break landing, and lies on the heap at the wall's foot until
  moss has it and it sinks. What hangs on the wall (window, clock, calendar, signs) goes with
  the block above it, and the signs' buttons follow (the exit sign lands in front of the
  desk); what is on the wall (cracks, climbers, the snail, the sill's snow) goes with the
  wall. Rain and snow fall through the room in their spells. The trees clear of the desk
  stand in front of the furniture, the rest behind it. The gaps and the window look out on one world (`wood/outside.ts`), ruined
  at the blast and healing over the years. Friday has days (`wood/daylight.ts`, a minute
  each): the season sets how long the sun is up and how high it climbs, how dark the night
  gets; the moon crosses the nights through its phases. Light is the world's, one pass a frame
  (korpi `light`): the room under its cover darkens with the day and further at night, the
  outside is in the open sky's light, and what lights itself (the clock, the signs, the AIs'
  lights and runes, the charger, fireflies) glows; the clock and the fireflies light what is
  near them. The ruin's grime is paint, not light. Friday is a screensaver, so it holds the screen awake while it runs
  (`wakeLock.ts`).
- **The office is one scene raster.** `paintOffice` paints every part through a korpi pen into
  one 320x180 raster with a depth per pixel, lights it once and presents it once. Everything is
  at its true depth, metres out from the back wall (`office/depth.ts`: the room's view and one
  table, `Z`): the wall at 0, what hangs on it at 0.02, the AIs' faces at 0.35, the desk's front
  at 0.4; what lies flat on the floor (`onFloor`) at its row's depth, what stands on it
  (`standing`, `footAt`) at its foot's, nothing under the floor. So what is nearer covers what is
  farther whatever order things are painted in; only what is translucent goes last. The world
  beyond the wall is behind it.
- **Scene pieces draw themselves.** A tree, a sprite, the calendar, pixel text: a paint
  function over a pen and plain values, no DOM. That is what lets the workbench show them
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
(the wood: shake the apple tree; the wall simulator: knock a block out or bring roof down,
then scrub, retune or switch the wall to bricks, rubble or plaster). A unit is a small adapter in
`src/routes/workbench/units.ts` over a draw function in `$lib`; production serves it too, unlinked and noindex.
`./install-hooks.sh` once after clone; the pre-commit hook runs `validate`. Icons: edit
`static/favicon.svg`, then `scripts/gen-icons.sh` (needs librsvg + ImageMagick). Tape: edit
`src/lib/tape/orientation.json`, then `uv run scripts/gen-tape.py` (Piper on mini, ffmpeg); it
re-sings each line on held notes and writes `static/tape/orientation.mp3` + `tape.json` cues.
Link card: `yarn dev`, then `SITE=http://localhost:5173 node scripts/gen-og.mjs` (borrows a
playwright install, see the script) captures both rooms into `static/og.jpg`.

## Out of scope

No backend, no accounts, no leaderboard, no real LLM calls: the AIs are scripted on purpose.
