import { describe, expect, it } from "vitest";

import { OFFICE_DAYS } from "../days";
import {
  accuracy,
  answer,
  createOffice,
  DESK_CAPACITY,
  type OfficeState,
  pay,
  pile,
  setAway,
  step,
} from "../engine";
import { LONGEST, makeMessage } from "../tasks";

type Player = (s: OfficeState) => void;

const run = (day: number, player: Player, seed = 9, watch?: Player): OfficeState => {
  const s = createOffice(OFFICE_DAYS[day], seed);
  for (let i = 0; s.phase !== "done"; i++) {
    step(s, 1 / 30);
    player(s);
    watch?.(s);
    if (i > 200_000) throw new Error("day never ended");
  }
  return s;
};

const idle: Player = () => {};
const right: Player = (s) => {
  const top = pile(s)[0];
  if (top) answer(s, top.message.answer);
};
const wrong: Player = (s) => {
  if (pile(s)[0]) answer(s, "nonsense");
};
/** Answers correctly, but takes eight seconds over each message. */
const slow = (): Player => {
  let since = 0;
  return (s) => {
    const top = pile(s)[0];
    if (!top) return;
    since += 1 / 30;
    if (since >= 8) {
      answer(s, top.message.answer);
      since = 0;
    }
  };
};

const WORKING_DAYS = [0, 1, 2, 3];

describe("the AIs", () => {
  it.each(WORKING_DAYS)("deliver every message whatever the specialist does, day %i", (d) => {
    for (const p of [idle, right, wrong, slow()]) {
      expect(run(d, p).tally.delivered).toBe(OFFICE_DAYS[d].messages);
    }
  });

  it("send the same messages for the same seed", () => {
    const prompts = (p: Player) => {
      const seen = new Map<number, string>();
      run(0, p, 4, (s) => s.envelopes.forEach((e) => seen.set(e.id, e.message.prompt)));
      return [...seen.values()];
    };
    expect(prompts(idle)).toEqual(prompts(right));
  });

  it("friday has no messages at all", () => {
    expect(createOffice(OFFICE_DAYS[4], 1).phase).toBe("done");
  });
});

describe("the desk", () => {
  it("piles up while the specialist is slow, and never beyond its capacity", () => {
    let highest = 0;
    run(3, slow(), 9, (s) => (highest = Math.max(highest, pile(s).length)));
    expect(highest).toBeGreaterThan(1);
    expect(highest).toBeLessThanOrEqual(DESK_CAPACITY);
  });

  it("overflows onto the floor, and the drone delivers what fell", () => {
    let fell = 0;
    const s = run(3, idle, 9, (st) => {
      fell = Math.max(fell, st.envelopes.filter((e) => e.stage === "floor").length);
    });
    expect(fell).toBeGreaterThan(0);
    expect(s.tally.dropped).toBe(OFFICE_DAYS[3].messages);
    expect(s.envelopes).toHaveLength(0);
  });

  it("a quick specialist drops nothing", () => {
    expect(run(0, right).tally.dropped).toBe(0);
  });
});

describe("a break", () => {
  it("clears the desk and the AIs finish without the specialist, faster", () => {
    const s = createOffice(OFFICE_DAYS[0], 9);
    for (let i = 0; i < 400; i++) step(s, 1 / 30);
    setAway(s, true);
    expect(pile(s)).toHaveLength(0);
    let t = 0;
    while (s.phase !== "done") {
      step(s, 1 / 30);
      t += 1 / 30;
    }
    expect(s.tally.delivered).toBe(OFFICE_DAYS[0].messages);
    expect(s.tally.automated).toBeGreaterThan(OFFICE_DAYS[0].messages / 2);
    expect(t).toBeLessThan(run(0, right).t);
    expect(accuracy(s.tally)).toBeLessThanOrEqual(1);
  });
});

describe("pay", () => {
  it("accrues salary regardless and moves only the bonus with accuracy", () => {
    const good = pay(run(0, right));
    const bad = pay(run(0, wrong));
    expect(good.salary).toBeGreaterThan(0);
    expect(bad.salary).toBeGreaterThan(0);
    expect(good.bonus).toBeGreaterThan(0);
    expect(bad.bonus).toBeLessThan(0);
  });
});

describe("tasks", () => {
  it("keypad answers are whole numbers and review answers are approve or reject", () => {
    let seed = 1;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 200; i++) {
      expect(makeMessage("hard", rand).answer).toMatch(/^-?\d+$/);
      expect(makeMessage("easy", rand).answer).toMatch(/^\d$/);
      expect(["approve", "reject"]).toContain(makeMessage("review", rand).answer);
    }
  });

  it("no message is longer than the room the screen keeps for it", () => {
    let seed = 3;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const length = (text: string) => Array.from(text).length;
    for (const task of ["review", "hard", "easy", "ok"] as const) {
      for (let i = 0; i < 2000; i++) {
        expect(length(makeMessage(task, rand).prompt)).toBeLessThanOrEqual(length(LONGEST[task]));
      }
    }
  });
});
