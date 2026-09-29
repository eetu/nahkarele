import type { Weather } from "$lib/scene/sky";

/**
 * What the specialist is asked to do. Each day the AIs simplify the job a little
 * further, until the specialist is not needed at all.
 */
export type Task = "review" | "hard" | "easy" | "ok" | "jar";

export type OfficeDay = {
  name: string;
  task: Task;
  /** Messages in the day. */
  messages: number;
  /** Seconds between messages, on average. */
  interval: number;
  memo: string;
  weather: Weather;
};

export const OFFICE_DAYS: OfficeDay[] = [
  {
    name: "maanantai",
    task: "review",
    messages: 14,
    interval: 4,
    memo: "every message between the AIs needs human approval. compliance requires it.",
    weather: "clear",
  },
  {
    name: "tiistai",
    task: "hard",
    messages: 6,
    interval: 3.5,
    memo: "the AIs have simplified your role. please enter the result.",
    weather: "snow",
  },
  {
    name: "keskiviikko",
    task: "easy",
    messages: 8,
    interval: 1.6,
    memo: "your role has been simplified further.",
    weather: "rain",
  },
  {
    name: "torstai",
    task: "ok",
    messages: 20,
    interval: 0.3,
    memo: "press ok.",
    weather: "clear",
  },
  {
    name: "perjantai",
    task: "jar",
    messages: 0,
    interval: 0,
    memo: "your position has been upgraded.",
    weather: "storm",
  },
];
