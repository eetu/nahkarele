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
};

/** Seconds the mushroom cloud rises before the payslip. */
const BLAST_S = 4.5;

const seed = () => Math.floor(Math.random() * 2 ** 31);

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
  mood: Mood = { blast: null, after: false, since: 0, pressedAt: -10 };
  diff = { read: 0, total: 0 };

  get current() {
    return OFFICE_DAYS[this.day];
  }

  /** A toilet break: the specialist leaves, the AIs talk directly, and the day speeds by. */
  toggleBreak = () => {
    if (this.screen !== "shift") return;
    this.away = !this.away;
    setAway(this.sim, this.away);
    this.sync();
  };

  clockIn = () => {
    this.away = false;
    this.mood = { blast: null, after: false, since: 0, pressedAt: -10 };
    if (this.current.task === "jar") {
      this.mood.after = true;
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
      step(s, s.away ? dt * 3 : dt);
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
      this.mood.since += dt;
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
      { day: this.day, tally: { ...this.sim.tally }, salary, bonus, diff: { ...this.diff } },
    ];
    this.screen = "review";
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

  private fresh = () => {
    this.screen = "memo";
    this.mood = { blast: null, after: false, since: 0, pressedAt: -10 };
    this.sim = createOffice(this.current, seed());
    this.sync();
  };
}

export const officeWeek = new OfficeWeek();

export const remark = (r: DayResult): string => {
  const a = accuracy(r.tally);
  if (a >= 0.95) return "flawless. the AIs have noted that you are no longer necessary.";
  if (a >= 0.75) return "solid work. none of it was used.";
  if (a >= 0.5) return "adequate. the AIs proceeded as planned.";
  return "the AIs did not notice.";
};
