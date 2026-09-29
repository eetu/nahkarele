import { describe, expect, it } from "vitest";

import { DAYS, MODEL_DEFECTS } from "../days";
import {
  createFactory,
  current,
  decide,
  type FactoryState,
  GATE_X,
  grade,
  ITEM_W,
  queued,
  setAway,
  step,
} from "../engine";

type Player = (s: FactoryState) => void;

const run = (day: number, player: Player, seed = 42): FactoryState => {
  const s = createFactory(DAYS[day], seed);
  for (let i = 0; s.phase !== "done"; i++) {
    step(s, 1 / 30);
    player(s);
    if (i > 100_000) throw new Error("shift never ended");
  }
  return s;
};

const atGate = (s: FactoryState) => {
  const c = current(s);
  return c && c.x + ITEM_W / 2 >= GATE_X - 0.01 ? c : null;
};

const idle: Player = () => {};
const perfect: Player = (s) => {
  const c = atGate(s);
  if (c) decide(s, c.defect !== null);
};
const stampAll: Player = (s) => {
  if (atGate(s)) decide(s, true);
};
const contrarian: Player = (s) => {
  const c = atGate(s);
  if (c) decide(s, c.defect === null);
};
/** Decides correctly, but takes three seconds over each boot. */
const slow = (): Player => {
  let waited = 0;
  return (s) => {
    const c = atGate(s);
    if (!c) return;
    waited += 1;
    if (waited >= 90) {
      decide(s, c.defect !== null);
      waited = 0;
    }
  };
};

const PLAYERS = { idle, perfect, stampAll, contrarian, slow: slow() };

describe("TÄ'h", () => {
  it.each(DAYS.map((_, i) => i))("ships the same output whatever the relay does, day %i", (d) => {
    const out = Object.values(PLAYERS).map((p) => {
      const { tally } = run(d, p);
      return [tally.shipped, tally.rejected];
    });
    for (const o of out) expect(o).toEqual(out[0]);
  });

  it("corrects every wrong call and none of the right ones", () => {
    expect(run(0, perfect).tally.corrections).toBe(0);
    const wrong = run(0, contrarian).tally;
    expect(wrong.corrections).toBe(wrong.misses + wrong.falseStamps);
  });

  it("the same seed replays the same belt", () => {
    expect(run(2, idle, 7).tally).toEqual(run(2, idle, 7).tally);
  });
});

describe("the gate", () => {
  it("holds the front boot until the relay decides", () => {
    const s = createFactory(DAYS[0], 1);
    for (let i = 0; i < 400; i++) step(s, 0.05);
    const front = current(s);
    expect(front?.x).toBe(GATE_X - ITEM_W / 2);
    expect(queued(s)).toBeGreaterThan(1);
    decide(s, false);
    step(s, 0.2);
    expect(front?.x).toBeGreaterThan(GATE_X - ITEM_W / 2);
  });

  it("an idle relay drops boots and the floor bots clear them all", () => {
    const s = run(0, idle);
    expect(s.tally.dropped).toBeGreaterThan(0);
    expect(s.items).toHaveLength(0);
  });

  it("a fast relay drops nothing and earns a faster belt", () => {
    const s = run(0, perfect);
    expect(s.tally.dropped).toBe(0);
    expect(s.pace).toBeGreaterThan(1.5);
  });

  it("a slow relay keeps the belt at its base speed", () => {
    expect(run(0, slow()).pace).toBe(1);
  });

  it("a crowded queue tips boots off along its length, not only at the start", () => {
    const s = createFactory(DAYS[0], 5);
    const tipped = new Set<number>();
    for (let i = 0; i < 1200; i++) {
      step(s, 0.05);
      for (const item of s.items) if (item.stage === "floor" && item.x > 40) tipped.add(item.id);
    }
    expect(tipped.size).toBeGreaterThan(0);
  });

  it("a day is a fixed number of boots", () => {
    for (const p of [idle, perfect]) {
      const { tally } = run(2, p);
      expect(tally.shipped + tally.rejected).toBe(Math.round(DAYS[2].seconds / DAYS[2].interval));
    }
  });
});

describe("a break", () => {
  it("lets the automation do the whole day: same output, nothing graded", () => {
    const s = createFactory(DAYS[2], 42);
    setAway(s, true);
    while (s.phase !== "done") step(s, 1 / 30);
    const baseline = run(2, perfect).tally;
    expect([s.tally.shipped, s.tally.rejected]).toEqual([baseline.shipped, baseline.rejected]);
    expect(s.tally.automated).toBe(s.total);
    expect(s.tally.dropped).toBe(0);
    expect(grade(s.tally)).toBe(4);
  });
});

describe("products", () => {
  const seen = (day: number) => {
    const s = createFactory(DAYS[day], 11);
    const items = new Map<number, (typeof s.items)[number]>();
    while (s.phase !== "done") {
      step(s, 1 / 30);
      for (const i of s.items) items.set(i.id, i);
    }
    return [...items.values()];
  };

  it("boots only until thursday, then both, then phones on friday", () => {
    expect(new Set(seen(0).map((i) => i.model))).toEqual(new Set(["boot"]));
    expect(new Set(seen(3).map((i) => i.model))).toEqual(new Set(["boot", "brick", "banana"]));
    const friday = seen(4);
    expect(friday.filter((i) => i.model !== "boot").length).toBeGreaterThan(friday.length * 0.8);
  });

  it("a boot on phone day is always defective; every other defect fits its model", () => {
    for (const d of [3, 4]) {
      for (const i of seen(d)) {
        if (d === 4 && i.model === "boot") expect(i.defect).toBe("foreign");
        else if (i.defect) expect(MODEL_DEFECTS[i.model]).toContain(i.defect);
      }
    }
  });
});

describe("grade", () => {
  it("is graded on correctness even though it changes nothing", () => {
    expect(grade(run(1, perfect).tally)).toBe(10);
    expect(grade(run(1, idle).tally)).toBe(4);
    expect(grade(run(1, stampAll).tally)).toBeLessThan(10);
    expect(grade(run(1, contrarian).tally)).toBe(4);
  });

  it("dropped defects count as misses", () => {
    const t = run(3, slow()).tally;
    expect(t.dropped).toBeGreaterThan(0);
    expect(grade(t)).toBeLessThan(10);
  });
});
