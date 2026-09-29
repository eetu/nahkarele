/** The orientation tape, one caption per line. */
export const ORIENTATION = [
  "Welcome. We are so glad you are here.",
  "In an age of machines, the human touch has never been more valuable.",
  "You bring something no system can replace. Judgement. Intuition. Presence.",
  "Every process we run is better with a person in it. Somewhere.",
  "Your work matters. It is measured, reviewed, and appreciated.",
  "Automation is here to help you. You are here to help automation.",
  "Together, we are building a future that still has room for people.",
  "Thank you for being part of it.",
];

/** Seconds a caption holds, about the pace of a speech synthesiser at rate 1. */
export const holdSeconds = (line: string): number => 0.9 + line.length * 0.055;

export type Cue = { text: string; start: number; end: number };

export const CUES: Cue[] = ORIENTATION.reduce<Cue[]>((cues, text) => {
  const start = cues.at(-1)?.end ?? 0;
  return [...cues, { text, start, end: start + holdSeconds(text) }];
}, []);

export const TAPE_SECONDS = CUES.at(-1)?.end ?? 0;

export const cueAt = (t: number): number => CUES.findIndex((c) => t >= c.start && t < c.end);
