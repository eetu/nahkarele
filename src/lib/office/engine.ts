import type { OfficeDay } from "./days";
import { makeMessage, type Message } from "./tasks";

/** The scene is 320 × 180 logical pixels, like the factory. */
export const SCENE_W = 320;
export const SCENE_H = 180;

/** Seconds a message takes to fly between an AI and the desk. */
export const FLY_S = 0.7;
/** Salary per second of shift, EUR. The rate does not depend on anything you do. */
export const WAGE_PER_S = 2.2;
/** Envelopes the in-tray holds; the next one goes on the floor. */
export const DESK_CAPACITY = 6;
/** A pile this tall starts to slide. */
const WOBBLY = 4;
const SLIDE_RATE = 0.12;
/** After the last message, seconds without an answer before the AIs take the rest. */
const CLOSING_IDLE_S = 5;
/** Seconds an envelope takes to fall off the desk. */
export const FALL_S = 0.4;

/** Where things are in the scene, shared with the drawing. */
export const TRAY = { x: 180, y: 112 };
export const AI_MOUTH = { 1: { x: 50, y: 76 }, 2: { x: 261, y: 76 } } as const;
export const FLOOR_Y = 150;
export const DRONE_HOME = { x: 160, y: 40 };
const DRONE_MAX = 320;
const DRONE_ACCEL = 2400;

export type Ai = 1 | 2;

/** `direct` is AI to AI with nobody at the desk. */
export type Stage = "fly-in" | "desk" | "fly-out" | "falling" | "floor" | "carried" | "direct";

export type Verdict = "correct" | "wrong" | "dropped";

/** Something that happened this step that can be heard. The stage drains the list each frame. */
export type OfficeEvent =
  | { kind: "send"; from: Ai; direct: boolean }
  | { kind: "land" }
  | { kind: "fall"; x: number }
  | { kind: "receive"; to: Ai };

export type Envelope = {
  id: number;
  from: Ai;
  to: Ai;
  message: Message;
  stage: Stage;
  stageAt: number;
  /** Floor position once it has fallen. */
  x: number;
};

export type Drone = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  carrying: number | null;
  target: number | null;
};

export type Tally = {
  correct: number;
  wrong: number;
  /** Fell on the floor or were taken by the AIs unanswered. */
  dropped: number;
  /** Messages the receiving AI got: every one of them, whatever the verdict. */
  delivered: number;
  /** Exchanged directly while the specialist was on a break: out of the accuracy. */
  automated: number;
};

export type OfficeState = {
  day: OfficeDay;
  t: number;
  phase: "running" | "closing" | "done";
  envelopes: Envelope[];
  nextId: number;
  spawned: number;
  nextIn: number;
  lastAnswer: number;
  /** The last verdict, for the desk to flash. */
  last: { verdict: Verdict; at: number } | null;
  drone: Drone;
  seed: number;
  /** Separate stream for slides, so a toppling pile never changes the messages. */
  slideSeed: number;
  tally: Tally;
  /** The specialist is on a break: the AIs talk directly, and faster. */
  away: boolean;
  events: OfficeEvent[];
};

const mulberry = (state: number): [number, number] => {
  const next = (state + 0x6d2b79f5) | 0;
  let r = Math.imul(next ^ (next >>> 15), 1 | next);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, next];
};

const random = (s: OfficeState): number => {
  const [v, next] = mulberry(s.seed);
  s.seed = next;
  return v;
};

const slideRandom = (s: OfficeState): number => {
  const [v, next] = mulberry(s.slideSeed);
  s.slideSeed = next;
  return v;
};

export const createOffice = (day: OfficeDay, seed: number): OfficeState => ({
  day,
  t: 0,
  phase: day.messages > 0 ? "running" : "done",
  envelopes: [],
  nextId: 1,
  spawned: 0,
  nextIn: 0.6,
  lastAnswer: 0,
  last: null,
  drone: { ...DRONE_HOME, vx: 0, vy: 0, carrying: null, target: null },
  seed,
  slideSeed: seed ^ 0x5bd1e995,
  tally: { correct: 0, wrong: 0, dropped: 0, delivered: 0, automated: 0 },
  away: false,
  events: [],
});

/** The pile on the desk, oldest first: the one the specialist is looking at is [0]. */
export const pile = (s: OfficeState): Envelope[] =>
  s.envelopes
    .filter((e) => e.stage === "desk")
    .sort((a, b) => a.stageAt - b.stageAt || a.id - b.id);

const spawn = (s: OfficeState) => {
  const from: Ai = random(s) < 0.5 ? 1 : 2;
  const message = makeMessage(s.day.task, () => random(s));
  s.envelopes.push({
    id: s.nextId++,
    from,
    to: from === 1 ? 2 : 1,
    message,
    stage: s.away ? "direct" : "fly-in",
    stageAt: s.t,
    x: TRAY.x,
  });
  if (s.away) s.tally.automated += 1;
  s.spawned += 1;
  s.events.push({ kind: "send", from, direct: s.away });
};

const fall = (s: OfficeState, e: Envelope) => {
  e.stage = "falling";
  e.stageAt = s.t;
  e.x = TRAY.x + (slideRandom(s) < 0.5 ? -1 : 1) * (14 + slideRandom(s) * 30);
  s.tally.dropped += 1;
  s.last = { verdict: "dropped", at: s.t };
  s.events.push({ kind: "fall", x: e.x });
};

const leaveDesk = (s: OfficeState, e: Envelope) => {
  e.stage = "fly-out";
  e.stageAt = s.t;
};

const moveDrone = (s: OfficeState, d: number) => {
  const dr = s.drone;
  let target = dr.carrying ?? dr.target;
  let item = target === null ? undefined : s.envelopes.find((e) => e.id === target);
  if (!item || (dr.carrying === null && item.stage !== "floor")) {
    dr.carrying = null;
    dr.target = null;
    item = s.envelopes
      .filter((e) => e.stage === "floor")
      .sort((a, b) => Math.abs(a.x - dr.x) - Math.abs(b.x - dr.x))[0];
    if (item) dr.target = item.id;
    target = dr.target;
  }
  const goal = !item
    ? DRONE_HOME
    : dr.carrying !== null
      ? AI_MOUTH[item.to]
      : { x: item.x + 4, y: FLOOR_Y - 8 };
  // Accelerate toward the goal, capped by what it can still brake from.
  const axis = (pos: number, v: number, to: number) => {
    const dx = to - pos;
    const want = Math.sign(dx) * Math.min(DRONE_MAX, Math.sqrt(2 * DRONE_ACCEL * Math.abs(dx)));
    const dv = want - v;
    return v + Math.sign(dv) * Math.min(Math.abs(dv), DRONE_ACCEL * d);
  };
  dr.vx = axis(dr.x, dr.vx, goal.x);
  dr.vy = axis(dr.y, dr.vy, goal.y);
  dr.x += dr.vx * d;
  dr.y += dr.vy * d;
  if (!item || Math.hypot(goal.x - dr.x, goal.y - dr.y) > 2) return;
  if (dr.carrying === null) {
    dr.carrying = item.id;
    item.stage = "carried";
    item.stageAt = s.t;
    return;
  }
  s.tally.delivered += 1;
  s.events.push({ kind: "receive", to: item.to });
  s.envelopes = s.envelopes.filter((e) => e.id !== item.id);
  dr.carrying = null;
  dr.target = null;
};

export const step = (s: OfficeState, dt: number) => {
  if (s.phase === "done") return;
  const d = Number.isFinite(dt) ? Math.min(0.1, Math.max(0, dt)) : 0;
  s.t += d;

  if (s.phase === "running") {
    // Without anyone at the desk the AIs go three times as fast.
    s.nextIn -= s.away ? d * 3 : d;
    while (s.nextIn <= 0 && s.spawned < s.day.messages) {
      spawn(s);
      s.nextIn += s.day.interval * (0.7 + random(s) * 0.6);
    }
    if (s.spawned >= s.day.messages) {
      s.phase = "closing";
      s.lastAnswer = Math.max(s.lastAnswer, s.t);
    }
  }

  for (const e of s.envelopes) {
    const age = s.t - e.stageAt;
    if (e.stage === "fly-in" && age >= FLY_S) {
      if (pile(s).length >= DESK_CAPACITY) fall(s, e);
      else {
        e.stage = "desk";
        e.stageAt = s.t;
        s.events.push({ kind: "land" });
      }
    } else if (e.stage === "falling" && age >= FALL_S) {
      e.stage = "floor";
      e.stageAt = s.t;
    }
  }

  // A tall pile slides: anything above the wobbly height can go over the edge.
  const stack = pile(s);
  if (stack.length > WOBBLY) {
    for (const e of stack.slice(WOBBLY)) if (slideRandom(s) < SLIDE_RATE * d) fall(s, e);
  }

  // After the last message, a specialist who stops answering is simply bypassed.
  if (s.phase === "closing" && (s.away || s.t - s.lastAnswer > CLOSING_IDLE_S)) {
    for (const e of pile(s)) {
      s.tally.dropped += 1;
      leaveDesk(s, e);
    }
  }

  const arrived = s.envelopes.filter(
    (e) => (e.stage === "fly-out" || e.stage === "direct") && s.t - e.stageAt >= FLY_S,
  );
  s.tally.delivered += arrived.length;
  for (const e of arrived) s.events.push({ kind: "receive", to: e.to });
  s.envelopes = s.envelopes.filter((e) => !arrived.includes(e));

  moveDrone(s, d);

  if (s.phase === "closing" && s.envelopes.length === 0) s.phase = "done";
};

/** The specialist's input for the oldest message on the desk. Returns the verdict, or null. */
export const answer = (s: OfficeState, input: string): Verdict | null => {
  const e = pile(s)[0];
  if (!e) return null;
  const verdict: Verdict = input.trim() === e.message.answer ? "correct" : "wrong";
  s.tally[verdict] += 1;
  s.last = { verdict, at: s.t };
  s.lastAnswer = s.t;
  leaveDesk(s, e);
  return verdict;
};

/** Go on a break, or come back. Leaving clears the desk: the AIs take it from here. */
export const setAway = (s: OfficeState, away: boolean) => {
  s.away = away;
  if (!away) return;
  for (const e of pile(s)) {
    e.stage = "direct";
    e.stageAt = s.t;
    s.tally.automated += 1;
  }
};

/** How far through the shift, by messages sent. */
export const progress = (s: OfficeState): number =>
  s.day.messages ? Math.min(1, s.spawned / s.day.messages) : 1;

export const accuracy = (t: Tally): number => {
  const n = t.correct + t.wrong + t.dropped;
  return n ? t.correct / n : 0;
};

/** Salary for the time on shift, plus or minus a bonus for accuracy. */
export const pay = (s: OfficeState): { salary: number; bonus: number } => {
  const salary = Math.round(s.t * WAGE_PER_S * 100) / 100;
  const bonus = Math.round((accuracy(s.tally) - 0.75) * 80 * 100) / 100;
  return { salary, bonus };
};
