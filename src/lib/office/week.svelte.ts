import type { Knock } from "@anarkisti/korpi/masonry";

import { sfx } from "$lib/audio/sfx.svelte";

import { OFFICE_DAYS } from "./days";
import type { Mood } from "./draw";
import {
  accuracy,
  answer,
  createOffice,
  type OfficeState,
  pay,
  pile,
  setAway,
  step,
  type Tally,
  type Verdict,
} from "./engine";

export type Screen = "memo" | "shift" | "blast" | "review" | "loop";

export type DayResult = {
  day: number;
  tally: Tally;
  salary: number;
  bonus: number;
  /** Diff lines read against lines approved, from the review dialog. */
  diff: { read: number; total: number };
  /** The shift ended with the specialist still on the toilet. */
  inToilet: boolean;
};

/** Seconds the mushroom cloud rises before the payslip. */
const BLAST_S = 4.5;

const seed = () => Math.floor(Math.random() * 2 ** 31);

/** When friday began, as a wall-clock time: the wood keeps growing through sleeps and reloads. */
const FRIDAY_KEY = "nahkarele:specialist:friday";

const loadFriday = (): number | null => {
  try {
    const v = Number(localStorage.getItem(FRIDAY_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
};

/** Friday's wood is shaped by when friday began: the same through reloads, new each week. */
const woodSeed = (at: number) => Math.floor(at / 1000) % 2 ** 31;

const saveFriday = (at: number | null) => {
  try {
    if (at === null) {
      localStorage.removeItem(FRIDAY_KEY);
      localStorage.removeItem(TAPS_KEY);
    } else localStorage.setItem(FRIDAY_KEY, String(at));
  } catch {
    /* the wood then starts over on reload */
  }
};

/** What has been done to this friday: apples shaken down, blocks poked out of the wall. */
const TAPS_KEY = "nahkarele:specialist:friday:taps";
type Taps = Pick<Mood, "knocks" | "pokes">;

const loadTaps = (): Taps => {
  try {
    const v = JSON.parse(localStorage.getItem(TAPS_KEY) ?? "null") as Partial<Taps> | null;
    return { knocks: v?.knocks ?? {}, pokes: v?.pokes ?? [] };
  } catch {
    return { knocks: {}, pokes: [] };
  }
};

const saveTaps = ({ knocks, pokes }: Taps) => {
  try {
    localStorage.setItem(TAPS_KEY, JSON.stringify({ knocks, pokes }));
  } catch {
    /* they are then undone by a reload */
  }
};

/** A room that has not had friday yet. */
const calm = (): Mood => ({
  blast: null,
  after: false,
  since: 0,
  pressedAt: -10,
  seed: 0,
  knocks: {},
  pokes: [],
});

/**
 * The specialist's week. The simulation lives in `sim` outside the reactive graph;
 * the frame loop steps it and copies what the page shows into `hud`.
 */
class OfficeWeek {
  day = $state(0);
  away = $state(false);
  screen = $state<Screen>("memo");
  results = $state<DayResult[]>([]);
  hud = $state({
    salary: 0,
    left: 0,
    prompt: null as string | null,
    /** The envelope being looked at, so the desk can tell a new one from a repeat. */
    promptId: 0,
    /** Envelopes on the desk, the current one included. */
    pile: 0,
  });
  sim: OfficeState = createOffice(OFFICE_DAYS[0], seed());
  mood: Mood = calm();
  diff = { read: 0, total: 0 };
  /** Wall-clock start of friday's loop, while it runs. */
  private fridayAt: number | null = null;
  /** Dev only: how fast friday's clock runs; negative runs it back. */
  rate = $state(1);

  get current() {
    return OFFICE_DAYS[this.day];
  }

  /** A toilet break: the specialist leaves, the AIs talk directly, and the day speeds by. */
  toggleBreak = () => {
    if (this.screen !== "shift") return;
    this.away = !this.away;
    if (this.away) sfx.door();
    else sfx.flush();
    setAway(this.sim, this.away);
    this.sync();
  };

  clockIn = () => {
    this.away = false;
    this.mood = calm();
    if (this.current.task === "jar") {
      this.fridayAt = Date.now();
      saveFriday(this.fridayAt);
      saveTaps(this.mood);
      this.mood.after = true;
      this.mood.seed = woodSeed(this.fridayAt);
      this.screen = "loop";
      return;
    }
    this.sim = createOffice(this.current, seed());
    this.diff = { read: 0, total: 0 };
    this.screen = "shift";
  };

  /** Called by the frame loop. */
  tick = (dt: number) => {
    const s = this.sim;
    if (this.screen === "shift") {
      // Three steps a frame on a break, not one tripled one: the engine caps a step at 0.1 s.
      for (let i = 0; i < (s.away ? 3 : 1); i++) step(s, dt);
      if (s.phase === "done") {
        if (s.day.task === "ok") {
          this.screen = "blast";
          this.mood.blast = 0;
        } else this.endDay();
      }
    } else if (this.screen === "blast" && this.mood.blast !== null) {
      this.mood.blast += dt;
      if (this.mood.blast > BLAST_S) this.endDay();
    } else if (this.screen === "loop") {
      // Wall time, not frame time: a sleeping phone wakes to a wood that kept growing. A dev
      // rate moves the start instead, so everything that reads the clock follows.
      if (this.rate !== 1 && this.fridayAt !== null) {
        this.fridayAt = Math.min(Date.now(), this.fridayAt - dt * 1000 * (this.rate - 1));
      }
      this.mood.since = (Date.now() - (this.fridayAt ?? Date.now())) / 1000;
    }
    this.sync();
  };

  sync = () => {
    const s = this.sim;
    this.hud.salary = pay(s).salary;
    const stack = pile(s);
    this.hud.left = s.day.messages - s.spawned;
    this.hud.prompt = stack[0]?.message.prompt ?? null;
    this.hud.promptId = stack[0]?.id ?? 0;
    this.hud.pile = stack.length;
  };

  reviewed = (read: number, total: number) => {
    this.diff.read += read;
    this.diff.total += total;
  };

  answer = (input: string): Verdict | null => {
    if (this.screen !== "shift") return null;
    this.mood.pressedAt = this.sim.t;
    const v = answer(this.sim, input);
    this.sync();
    return v;
  };

  endDay = () => {
    const { salary, bonus } = pay(this.sim);
    this.results = [
      ...this.results.filter((r) => r.day !== this.day),
      {
        day: this.day,
        tally: { ...this.sim.tally },
        salary,
        bonus,
        diff: { ...this.diff },
        inToilet: this.away,
      },
    ];
    this.screen = "review";
    if (this.away) sfx.flush();
    this.away = false;
  };

  next = () => {
    this.day = Math.min(OFFICE_DAYS.length - 1, this.day + 1);
    this.fresh();
  };

  retry = () => this.fresh();

  newWeek = () => {
    this.day = 0;
    this.results = [];
    this.fresh();
  };

  /** Dev only: straight to the morning of `day`, keeping earlier results. */
  jump = (day: number) => {
    if (day < 0 || day >= OFFICE_DAYS.length) return;
    this.day = day;
    this.results = this.results.filter((r) => r.day < day);
    this.fresh();
  };

  /** A shake of the apple tree on friday: apple `key` comes down now. */
  knock = (key: string) => {
    this.mood.knocks[key] = this.mood.since;
    saveTaps(this.mood);
  };

  /** A poke at the back wall on friday, knocking out the block at `knock`. A new list, so the
   *  wall built from the last one is told apart. */
  poke = (knock: Knock) => {
    this.mood.pokes = [...this.mood.pokes, knock];
    saveTaps(this.mood);
  };

  /** Dev only: put friday's clock at `since` seconds. */
  warp = (since: number) => {
    if (this.fridayAt === null) return;
    this.fridayAt = Date.now() - Math.max(0, since) * 1000;
    saveFriday(this.fridayAt);
    this.mood.since = Math.max(0, since);
  };

  /** Dev only: run friday's clock at `rate` (1 is real time). */
  setRate = (rate: number) => {
    this.rate = rate;
    if (this.fridayAt !== null) saveFriday(this.fridayAt);
  };

  /** Friday, once reached, is where the room stays: the loop picks up where the clock is. */
  resume = () => {
    const at = loadFriday();
    if (at === null) return;
    this.fridayAt = at;
    this.day = OFFICE_DAYS.length - 1;
    this.mood = {
      ...calm(),
      after: true,
      since: (Date.now() - at) / 1000,
      seed: woodSeed(at),
      ...loadTaps(),
    };
    this.screen = "loop";
  };

  private fresh = () => {
    this.fridayAt = null;
    saveFriday(null);
    this.screen = "memo";
    this.mood = calm();
    this.sim = createOffice(this.current, seed());
    this.sync();
  };
}

export const officeWeek = new OfficeWeek();
officeWeek.resume();

export const remark = (r: DayResult): string => {
  const a = accuracy(r.tally);
  if (a >= 0.95) return "flawless. the AIs have noted that you are no longer necessary.";
  if (a >= 0.75) return "solid work. none of it was used.";
  if (a >= 0.5) return "adequate. the AIs proceeded as planned.";
  return "the AIs did not notice.";
};
