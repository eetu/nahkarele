import type { Task } from "./days";

/** One message between the AIs, and the answer the specialist should give. */
export type Message = {
  /** Shown on the specialist's screen. */
  prompt: string;
  /** "approve" / "reject" on review days, digits on keypad days, "ok" on ok days. */
  answer: string;
};

type Rand = () => number;

const int = (rand: Rand, lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = <T>(rand: Rand, xs: T[]): T => xs[Math.floor(rand() * xs.length) % xs.length];

/** A plausible status update from one AI to the other; about a third carry an error. */
const review = (rand: Rand): Message => {
  const wrong = rand() < 0.35;
  const off = (n: number) => (wrong ? n + pick(rand, [-2, -1, 1, 2, 3]) : n);
  const kinds: (() => string)[] = [
    () => {
      const [a, b, c] = [int(rand, 2, 8), int(rand, 1, 5), int(rand, 1, 4)];
      return `Estimate: search ${a} weeks, billing ${b}, dark mode ${c}. Total ${off(a + b + c)} weeks.`;
    },
    () => {
      const n = int(rand, 12, 60);
      return `Migrated ${n} of ${n} tables. Row counts: ${n * 1000} source, ${off(n) * 1000} target. Matching.`;
    },
    () => {
      const x = int(rand, 2, 40) * 10;
      const vat = Math.round(x * 1.255 * 100) / 100;
      const shown = wrong ? Math.round(x * 1.24 * 100) / 100 : vat;
      return `Invoice ${x.toFixed(2)} EUR + VAT 25.5 % = ${shown.toFixed(2)} EUR. Sending.`;
    },
    () => {
      const p = int(rand, 120, 900);
      return `Tests: ${p} passed, ${wrong ? int(rand, 1, 4) : 0} failed. Ready to ship.`;
    },
    () => {
      const d = int(rand, 2, 9);
      return `Refund ${(wrong ? d * 10 + 5 : d * 10).toFixed(2)} EUR for a double charge of ${(d * 10).toFixed(2)} EUR.`;
    },
  ];
  return { prompt: pick(rand, kinds)(), answer: wrong ? "reject" : "approve" };
};

/** Something only a calculator should be asked, with a whole-number answer. */
const hard = (rand: Rand): Message => {
  const kinds: (() => Message)[] = [
    () => {
      const a = int(rand, 1, 4) * 2;
      const k = int(rand, 1, 5);
      return { prompt: `∫₀^${a} ${k}x dx = ?`, answer: String((k * a * a) / 2) };
    },
    () => {
      const [a, b, c, d] = [int(rand, 1, 9), int(rand, 1, 9), int(rand, 1, 9), int(rand, 1, 9)];
      return { prompt: `det [${a} ${b}; ${c} ${d}] = ?`, answer: String(a * d - b * c) };
    },
    () => {
      const n = int(rand, 5, 24);
      return { prompt: `Σ i, i = 1…${n} = ?`, answer: String((n * (n + 1)) / 2) };
    },
    () => {
      const k = int(rand, 3, 12);
      return { prompt: `log₂ ${2 ** k} = ?`, answer: String(k) };
    },
    () => {
      const g = int(rand, 2, 12);
      const [a, b] = [g * int(rand, 2, 9), g * int(rand, 2, 9)];
      const gcd = (x: number, y: number): number => (y ? gcd(y, x % y) : x);
      return { prompt: `gcd(${a}, ${b}) = ?`, answer: String(gcd(a, b)) };
    },
  ];
  return pick(rand, kinds)();
};

const easy = (rand: Rand): Message => {
  const [a, b] = [int(rand, 1, 4), int(rand, 1, 4)];
  return { prompt: `${a} + ${b} = ?`, answer: String(a + b) };
};

const GLYPHS = "⟁⌬⍟⎔⏣⌖⍜⎊⌾⍉⏧⟟⌘⎈⏃⍭⌗⎍".split("");

const ok = (rand: Rand): Message => ({
  prompt: Array.from({ length: int(rand, 6, 14) }, () => pick(rand, GLYPHS)).join(""),
  answer: "ok",
});

export const makeMessage = (task: Task, rand: Rand): Message =>
  task === "review"
    ? review(rand)
    : task === "hard"
      ? hard(rand)
      : task === "easy"
        ? easy(rand)
        : ok(rand);

/**
 * The longest message each task can put on the screen. The desk keeps room for it, so the
 * screen holds its size from one message to the next.
 */
export const LONGEST: Record<Task, string> = {
  review: "Migrated 60 of 60 tables. Row counts: 60000 source, 63000 target. Matching.",
  hard: "det [9 9; 9 9] = ?",
  easy: "4 + 4 = ?",
  ok: GLYPHS[0].repeat(14),
  jar: "",
};
