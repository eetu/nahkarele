import { COVERS, type Day, type Defect, type Model, MODEL_DEFECTS, pickModel } from "./days";

/** The scene is 320 × 180 logical pixels. */
export const SCENE_W = 320;
export const SCENE_H = 180;
export const ITEM_W = 16;
/** Top of the belt surface; items stand on it. */
export const BELT_Y = 128;
/** The lit stretch of belt; a boot is inspectable once its centre is under the lamp. */
export const ZONE = { from: 56, to: 204 };
/** Where the front boot's centre stops until the relay decides. */
export const GATE_X = 150;
/** Space kept between queued boots. */
const GAP = 2;
/** Where the belt enters and leaves TÄ'h. */
export const MACHINE_IN = 228;
export const MACHINE_OUT = 292;
/** Seconds each boot spends inside TÄ'h. */
export const MACHINE_S = 0.8;
/** Floor bots: where they rest, and where they take what they pick up. */
export const BOT_HOME = [200, 216];
export const SHRED_X = 262;
export const OUT_X = 312;
/** Floor bots: top speed and acceleration, px/s and px/s². They brake to stop dead on target. */
export const BOT_MAX = 320;
const BOT_ACCEL = 1400;
/** Seconds a boot takes to fall into the shredder before it is gone. */
const REJECT_S = 0.8;
const DELIVER_S = 0.3;
/** After the last boot, seconds without a decision before the gate gives up. */
const CLOSING_IDLE_S = 4;
/** A decision this soon after the boot reached the gate speeds the whole line up. */
const FAST_S = 1;
const PACE_STEP = 1.07;
export const MAX_PACE = 2.6;
/** Once the queue reaches this far back, crowded boots start tipping off the belt. */
const CROWDED_X = 40;
/** Chance per second for each crowded boot to tip off. */
const TIP_RATE = 0.12;

export type Stage = "belt" | "machine" | "shipped" | "rejected" | "floor" | "carried" | "delivered";

/** What TÄ'h did about the relay's call: nothing, undid a stamp, or caught a miss. */
export type Correction = "unstamped" | "caught" | null;

export type Item = {
  id: number;
  /** Left edge, logical px. */
  x: number;
  model: Model;
  /** Snap-on cover colour for a brick phone; undefined is stock. */
  cover: string | undefined;
  defect: Defect | null;
  flipped: boolean;
  /** The relay has stamped or passed it, so the gate lets it go. */
  decided: boolean;
  stamped: boolean;
  /** When it reached the gate, or null while still travelling. */
  gateAt: number | null;
  /** Standing still in the queue this tick. */
  stuck: boolean;
  stage: Stage;
  /** When it entered its current stage. */
  stageAt: number;
  correction: Correction;
  /** Handled by the automation while the relay was away. */
  auto: boolean;
};

export type Bot = {
  id: number;
  x: number;
  facing: 1 | -1;
  /** Signed velocity, px/s. */
  v: number;
  /** The floor item it is heading for, then carrying. */
  item: number | null;
  carrying: boolean;
};

export type Tally = {
  /** Stamped and defective. */
  hits: number;
  /** Defective and not stamped, dropped ones included. */
  misses: number;
  /** Stamped and fine. */
  falseStamps: number;
  /** Fine and passed. */
  passes: number;
  /** Fell off the back of the queue. */
  dropped: number;
  shipped: number;
  rejected: number;
  corrections: number;
  /** Handled while the relay was on a break: out of the grade entirely. */
  automated: number;
};

export type Phase = "running" | "closing" | "done";

/** Something that happened this step that can be heard. The stage drains the list each frame. */
export type FactoryEvent =
  | { kind: "gate" }
  | { kind: "tip"; x: number; model: Model }
  | { kind: "scan" }
  | { kind: "verdict"; defect: boolean; correction: Correction }
  | { kind: "lift"; x: number }
  | { kind: "drop"; x: number; defect: boolean }
  | { kind: "whistle" };

export type FactoryState = {
  day: Day;
  t: number;
  phase: Phase;
  items: Item[];
  bots: Bot[];
  nextId: number;
  spawnIn: number;
  /** A day is a fixed number of boots, so the output never depends on the pace. */
  total: number;
  spawned: number;
  /** Belt and feed speed multiplier; efficient relays earn a faster belt. */
  pace: number;
  lastDecision: number;
  /** mulberry32 state for the boots themselves, so a seed replays the same belt. */
  seed: number;
  /** A second stream for which crowded boots tip off, so tipping never shifts the boots. */
  tipSeed: number;
  tally: Tally;
  /** The relay is on a break: the gate stands open and TÄ'h does it all. */
  away: boolean;
  events: FactoryEvent[];
};

const emptyTally = (): Tally => ({
  hits: 0,
  misses: 0,
  falseStamps: 0,
  passes: 0,
  dropped: 0,
  shipped: 0,
  rejected: 0,
  corrections: 0,
  automated: 0,
});

/** mulberry32: the next float in [0, 1) and the advanced state. */
const mulberry = (state: number): [number, number] => {
  const next = (state + 0x6d2b79f5) | 0;
  let r = Math.imul(next ^ (next >>> 15), 1 | next);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, next];
};

const random = (s: FactoryState): number => {
  const [v, next] = mulberry(s.seed);
  s.seed = next;
  return v;
};

const tipRandom = (s: FactoryState): number => {
  const [v, next] = mulberry(s.tipSeed);
  s.tipSeed = next;
  return v;
};

export const createFactory = (day: Day, seed: number): FactoryState => ({
  day,
  t: 0,
  phase: "running",
  items: [],
  bots: BOT_HOME.map((x, i) => ({ id: i + 1, x, facing: -1, v: 0, item: null, carrying: false })),
  nextId: 1,
  spawnIn: 0.4,
  total: Math.round(day.seconds / day.interval),
  spawned: 0,
  pace: 1,
  lastDecision: 0,
  seed,
  tipSeed: seed ^ 0x5bd1e995,
  tally: emptyTally(),
  away: false,
  events: [],
});

const onBelt = (s: FactoryState) => s.items.filter((i) => i.stage === "belt");

const spawn = (s: FactoryState) => {
  const { day } = s;
  const defective = random(s) < day.defectRate;
  // Every spawn draws the same randoms in the same order, so the belt a seed produces
  // does not depend on how the relay is doing.
  const kind = random(s);
  const flip = random(s);
  const landing = random(s);
  const model = pickModel(day.products, random(s));
  const cover = COVERS[Math.floor(random(s) * COVERS.length)];
  const possible = day.defects.filter((d) => MODEL_DEFECTS[model].includes(d));
  const defect: Defect | null = day.foreign?.includes(model)
    ? "foreign"
    : defective && possible.length
      ? possible[Math.floor(kind * possible.length)]
      : null;
  const item: Item = {
    id: s.nextId++,
    x: -ITEM_W,
    model,
    cover: model === "brick" ? cover : undefined,
    defect,
    flipped: day.flips && flip < 0.2,
    decided: false,
    stamped: false,
    gateAt: null,
    stuck: false,
    stage: "belt",
    stageAt: s.t,
    correction: null,
    auto: false,
  };
  // No room at the start of the belt: it goes over the edge.
  const tail = Math.min(...onBelt(s).map((i) => i.x));
  if (tail < GAP) {
    item.x = 2 + landing * 30;
    tip(s, item);
  }
  s.items.push(item);
  s.spawned += 1;
};

const tip = (s: FactoryState, item: Item) => {
  item.stage = "floor";
  item.stageAt = s.t;
  s.events.push({ kind: "tip", x: item.x + ITEM_W / 2, model: item.model });
  if (s.away) item.auto = true;
  else s.tally.dropped += 1;
};

/** A packed queue jostles: stuck boots anywhere along it can tip off onto the floor. */
const jostle = (s: FactoryState, d: number) => {
  const stuck = onBelt(s)
    .filter((i) => i.stuck)
    .sort((a, b) => b.x - a.x);
  const tail = stuck.at(-1);
  if (stuck.length < 4 || !tail || tail.x > CROWDED_X) return;
  for (const item of stuck.slice(1)) {
    if (tipRandom(s) < TIP_RATE * d) tip(s, item);
  }
};

/** TÄ'h's verdict, which is the only one that counts. */
const settle = (s: FactoryState, item: Item, dropped: boolean) => {
  const { tally } = s;
  if (item.auto) {
    tally.automated += 1;
    if (item.defect) tally.rejected += 1;
    else tally.shipped += 1;
    item.stageAt = s.t;
    return;
  }
  if (item.defect && item.stamped) tally.hits += 1;
  if (item.defect && !item.stamped) {
    tally.misses += 1;
    item.correction = "caught";
  }
  if (!item.defect && item.stamped) {
    tally.falseStamps += 1;
    item.correction = "unstamped";
  }
  if (!item.defect && !item.stamped && !dropped) tally.passes += 1;
  if (item.correction || dropped) tally.corrections += 1;
  if (item.defect) tally.rejected += 1;
  else tally.shipped += 1;
  item.stageAt = s.t;
};

const moveBelt = (s: FactoryState, d: number) => {
  const belt = onBelt(s).sort((a, b) => b.x - a.x);
  let limit = Infinity;
  for (const item of belt) {
    let max = limit;
    // Away, the gate stands open: the automation decides, correctly, as it passes.
    if (!item.decided && s.away && item.x + ITEM_W / 2 >= GATE_X - 0.01) {
      item.decided = true;
      item.auto = true;
      item.stamped = item.defect !== null;
    }
    if (!item.decided) max = Math.min(max, GATE_X - ITEM_W / 2);
    const want = item.x + s.day.speed * s.pace * d;
    item.stuck = max < want;
    item.x = Math.max(item.x, Math.min(want, max));
    if (!item.decided && item.gateAt === null && item.x >= GATE_X - ITEM_W / 2) {
      item.gateAt = s.t;
      s.events.push({ kind: "gate" });
    }
    limit = item.x - ITEM_W - GAP;
    if (item.x + ITEM_W / 2 >= MACHINE_IN) {
      item.stage = "machine";
      item.stageAt = s.t;
      s.events.push({ kind: "scan" });
    }
  }
};

const moveBots = (s: FactoryState, d: number) => {
  for (const bot of s.bots) {
    let item = bot.item === null ? undefined : s.items.find((i) => i.id === bot.item);
    if (!item) {
      bot.item = null;
      bot.carrying = false;
      const claimed = new Set(s.bots.map((b) => b.item));
      item = s.items
        .filter((i) => i.stage === "floor" && !claimed.has(i.id))
        .sort((a, b) => Math.abs(a.x - bot.x) - Math.abs(b.x - bot.x))[0];
      if (item) bot.item = item.id;
    }
    const home = BOT_HOME[bot.id - 1] ?? BOT_HOME[0];
    const goal = !item
      ? home
      : bot.carrying
        ? item.defect
          ? SHRED_X
          : OUT_X
        : item.x + ITEM_W / 2;
    const dx = goal - bot.x;
    // Accelerate toward the goal, capped by the speed it can still brake from.
    const brake = Math.sqrt(2 * BOT_ACCEL * Math.abs(dx));
    const want = Math.sign(dx) * Math.min(BOT_MAX, brake);
    const dv = want - bot.v;
    bot.v += Math.sign(dv) * Math.min(Math.abs(dv), BOT_ACCEL * d);
    const stepX = Math.abs(bot.v * d) >= Math.abs(dx) ? dx : bot.v * d;
    bot.x += stepX;
    if (stepX === dx) bot.v = 0;
    if (stepX !== 0) bot.facing = stepX > 0 ? 1 : -1;
    if (!item || Math.abs(goal - bot.x) > 0.5) {
      if (item && bot.carrying) item.x = bot.x - ITEM_W / 2;
      continue;
    }
    if (!bot.carrying) {
      bot.carrying = true;
      s.events.push({ kind: "lift", x: bot.x });
      item.stage = "carried";
      item.stageAt = s.t;
      continue;
    }
    item.stage = item.defect ? "rejected" : "delivered";
    item.x = bot.x - ITEM_W / 2;
    settle(s, item, true);
    s.events.push({ kind: "drop", x: bot.x, defect: item.defect !== null });
    bot.item = null;
    bot.carrying = false;
  }
};

export const step = (s: FactoryState, dt: number) => {
  if (s.phase === "done") return;
  const d = Number.isFinite(dt) ? Math.min(0.1, Math.max(0, dt)) : 0;
  s.t += d;

  if (s.phase === "running") {
    s.spawnIn -= d;
    while (s.spawnIn <= 0 && s.spawned < s.total) {
      spawn(s);
      s.spawnIn += (s.day.interval * (0.75 + random(s) * 0.5)) / s.pace;
    }
    if (s.spawned >= s.total) {
      s.phase = "closing";
      s.lastDecision = Math.max(s.lastDecision, s.t);
      s.events.push({ kind: "whistle" });
    }
  }
  // After the whistle the relay works through the queue. Left alone at the gate, it
  // opens and the rest goes through undecided.
  if (s.phase === "closing" && s.t - s.lastDecision > CLOSING_IDLE_S) {
    for (const item of onBelt(s)) item.decided = true;
  }

  moveBelt(s, d);
  jostle(s, d);
  for (const item of s.items) {
    if (item.stage === "machine" && s.t - item.stageAt >= MACHINE_S) {
      item.stage = item.defect ? "rejected" : "shipped";
      item.x = MACHINE_OUT;
      settle(s, item, false);
      s.events.push({ kind: "verdict", defect: item.defect !== null, correction: item.correction });
    } else if (item.stage === "shipped") {
      item.x += s.day.speed * s.pace * d;
    }
  }
  moveBots(s, d);

  s.items = s.items.filter(
    (i) =>
      !(i.stage === "shipped" && i.x > SCENE_W) &&
      !(i.stage === "rejected" && s.t - i.stageAt > REJECT_S) &&
      !(i.stage === "delivered" && s.t - i.stageAt > DELIVER_S),
  );

  if (s.phase === "closing" && s.items.length === 0) s.phase = "done";
};

/** The front of the queue: the next boot to decide, under the lamp or still on its way. */
export const next = (s: FactoryState): Item | null =>
  onBelt(s)
    .filter((i) => !i.decided)
    .reduce<Item | null>((a, i) => (!a || i.x > a.x ? i : a), null);

/** The boot waiting for a decision: the front of the queue, once it is under the lamp. */
export const current = (s: FactoryState): Item | null => {
  const front = next(s);
  return front && front.x + ITEM_W / 2 >= ZONE.from ? front : null;
};

/** Stamp or pass the current boot. Returns it, or null if there was nothing to decide. */
export const decide = (s: FactoryState, stampIt: boolean): Item | null => {
  const item = current(s);
  if (!item || s.phase === "done") return null;
  const quick = item.gateAt === null || s.t - item.gateAt < FAST_S;
  if (quick) s.pace = Math.min(MAX_PACE, s.pace * PACE_STEP);
  s.lastDecision = s.t;
  item.decided = true;
  item.stamped = stampIt;
  return item;
};

/** Is the scene point on the current boot? */
export const onCurrent = (s: FactoryState, x: number, y: number): boolean => {
  const item = current(s);
  if (!item || y < BELT_Y - ITEM_W - 4 || y > BELT_Y + 4) return false;
  return x >= item.x - 2 && x <= item.x + ITEM_W + 2;
};

/** How far through the day's boots the shift is, 0..1: the clock on the wall reads it. */
export const shiftProgress = (s: FactoryState): number =>
  Number.isFinite(s.total) && s.total > 0 ? Math.min(1, s.spawned / s.total) : 0;

/** Boots waiting behind the gate, the current one included. */
export const queued = (s: FactoryState): number => onBelt(s).filter((i) => !i.decided).length;

/** Go on a break, or come back from one. */
export const setAway = (s: FactoryState, away: boolean) => {
  s.away = away;
};

/** Finnish school grade, 4 (fail) to 10, from how well the stamps matched the defects. */
export const grade = (t: Tally): number => {
  if (t.hits + t.misses + t.falseStamps + t.passes === 0) return 4;
  const defects = t.hits + t.misses;
  const stamps = t.hits + t.falseStamps;
  const recall = defects === 0 ? 1 : t.hits / defects;
  const precision = stamps === 0 ? (defects === 0 ? 1 : 0) : t.hits / stamps;
  const f1 = recall + precision === 0 ? 0 : (2 * recall * precision) / (recall + precision);
  return Math.max(4, Math.min(10, 4 + Math.round(f1 * 6)));
};
