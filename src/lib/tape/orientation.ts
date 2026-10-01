import tape from "./tape.json";

/** One caption on the orientation tape, timed to the recording (scripts/gen-tape.py). */
export type Cue = { text: string; start: number; end: number };

export const CUES: Cue[] = tape.cues;

export const TAPE_SECONDS = tape.seconds;

export const cueAt = (t: number): number => CUES.findIndex((c) => t >= c.start && t < c.end);
