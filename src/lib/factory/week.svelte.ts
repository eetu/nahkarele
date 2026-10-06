import { sfx } from "$lib/audio/sfx.svelte";
import { clockAt } from "$lib/scene/sky";
import { track } from "$lib/track";

import { DAYS } from "./days";
import {
  createFactory,
  current,
  type FactoryState,
  GATE_X,
  grade,
  ITEM_W,
  queued,
  setAway,
  shiftProgress,
  type Tally,
} from "./engine";

export type Screen = "memo" | "shift" | "review" | "week";

export type DayResult = {
  day: number;
  tally: Tally;
  grade: number;
  /** The whistle went with the relay still on the toilet. */
  inToilet: boolean;
};

const demo = (day: number): FactoryState =>
  createFactory({ ...DAYS[day], seconds: Infinity }, Math.floor(Math.random() * 2 ** 31));

const BEST_KEY = "nahkarele:tehdas:best";

const loadBest = (): number | null => {
  try {
    const v = Number(localStorage.getItem(BEST_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
};

const saveBest = (v: number) => {
  try {
    localStorage.setItem(BEST_KEY, String(v));
  } catch {
    /* the best week is a convenience */
  }
};

/**
 * One working week at the boot factory. The simulation itself lives in `sim`,
 * outside the reactive graph: the frame loop mutates it sixty times a second and
 * only the few numbers the HUD shows are copied into `hud`.
 */
class Week {
  day = $state(0);
  screen = $state<Screen>("memo");
  results = $state<DayResult[]>([]);
  best = $state<number | null>(loadBest());
  away = $state(false);
  hud = $state({
    clock: "07:00",
    left: 0,
    pace: 1,
    queued: 0,
    dropped: 0,
    shipped: 0,
    waiting: false,
  });
  /** Before a shift the line runs without anyone at the station; reviews freeze the last frame. */
  sim: FactoryState = demo(0);

  get current() {
    return DAYS[this.day];
  }

  get average(): number {
    if (!this.results.length) return 0;
    return this.results.reduce((sum, r) => sum + r.grade, 0) / this.results.length;
  }

  /** A toilet break: the worker leaves, TÄ'h takes over, and the day speeds by. */
  toggleBreak = () => {
    if (this.screen !== "shift") return;
    this.away = !this.away;
    if (this.away) sfx.door();
    else sfx.flush();
    setAway(this.sim, this.away);
  };

  clockIn = () => {
    this.away = false;
    this.sim = createFactory(this.current, Math.floor(Math.random() * 2 ** 31));
    this.screen = "shift";
    this.sync();
    track("tehdas:start");
  };

  /** Called by the frame loop after each step. */
  sync = () => {
    const s = this.sim;
    this.hud.clock = clockAt(shiftProgress(s));
    if (this.screen !== "shift") return;
    this.hud.left = s.total - s.spawned;
    this.hud.pace = Math.round(s.pace * 10) / 10;
    this.hud.queued = queued(s);
    this.hud.dropped = s.tally.dropped;
    this.hud.shipped = s.tally.shipped;
    const front = current(s);
    this.hud.waiting = front !== null && front.x + ITEM_W / 2 >= GATE_X - 0.01;
    if (s.phase === "done") this.endDay();
  };

  endDay = () => {
    const tally = { ...this.sim.tally };
    this.results = [
      ...this.results.filter((r) => r.day !== this.day),
      { day: this.day, tally, grade: grade(tally), inToilet: this.away },
    ];
    this.screen = "review";
    if (this.away) sfx.flush();
    this.away = false;
    track(`tehdas:day${this.day + 1}`);
  };

  next = () => {
    if (this.day + 1 < DAYS.length) {
      this.day += 1;
      this.screen = "memo";
      this.sim = demo(this.day);
      return;
    }
    this.screen = "week";
    track("tehdas:week");
    const avg = Math.round(this.average * 10) / 10;
    if (this.best === null || avg > this.best) {
      this.best = avg;
      saveBest(avg);
    }
  };

  retry = () => {
    this.screen = "memo";
    this.sim = demo(this.day);
  };

  /** Dev only: straight to the morning of `day`, keeping earlier results. */
  jump = (day: number) => {
    if (day < 0 || day >= DAYS.length) return;
    this.day = day;
    this.results = this.results.filter((r) => r.day < day);
    this.screen = "memo";
    this.sim = demo(day);
  };

  newWeek = () => {
    this.day = 0;
    this.results = [];
    this.screen = "memo";
    this.sim = demo(0);
  };
}

export const week = new Week();
