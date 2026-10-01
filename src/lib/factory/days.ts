import type { Weather } from "$lib/scene/sky";

/** What rides the belt. The factory made rubber boots, then phones. */
export type Model = "boot" | "brick" | "banana";

export type Defect =
  | "hole"
  | "short"
  | "colour"
  | "toe"
  | "sole"
  | "crack"
  | "dark"
  | "cracked"
  | "keys"
  /** On a phone day, a boot is simply the wrong product. */
  | "foreign";

/** Which defects each model can have. */
export const MODEL_DEFECTS: Record<Model, Defect[]> = {
  boot: ["hole", "short", "colour", "toe", "sole", "crack"],
  brick: ["dark", "cracked", "keys"],
  banana: ["dark", "cracked"],
};

/** Snap-on covers for the brick phone; undefined is the stock blue. */
export const COVERS = [undefined, undefined, "red", "yellow", "grey"] as const;

export type Product = { model: Model; weight: number };

export type Day = {
  name: string;
  /** Belt speed, logical px per second. */
  speed: number;
  /** Seconds between items. */
  interval: number;
  products: Product[];
  /** Models that do not belong on the belt today: always defective. */
  foreign?: Model[];
  defects: Defect[];
  /** Share of items that arrive defective. */
  defectRate: number;
  /** Upside-down items appear. They are fine: TÄ'h turns them. */
  flips: boolean;
  /** Nominal length at base pace; sets how many items the day has. */
  seconds: number;
  memo: string;
  weather: Weather;
};

const BOOTS: Product[] = [{ model: "boot", weight: 1 }];

export const DAYS: Day[] = [
  {
    name: "monday",
    speed: 30,
    interval: 1.7,
    products: BOOTS,
    defects: ["hole", "short"],
    defectRate: 0.3,
    flips: false,
    seconds: 45,
    memo: "you are the last line of quality control.",
    weather: "clear",
  },
  {
    name: "tuesday",
    speed: 36,
    interval: 1.4,
    products: BOOTS,
    defects: ["hole", "short", "colour", "toe"],
    defectRate: 0.32,
    flips: false,
    seconds: 50,
    memo: "we make black boots. we have always made black boots.",
    weather: "snow",
  },
  {
    name: "wednesday",
    speed: 42,
    interval: 1.2,
    products: BOOTS,
    defects: ["hole", "short", "colour", "toe", "sole"],
    defectRate: 0.34,
    flips: true,
    seconds: 55,
    memo: "a boot without a sole is not a boot.",
    weather: "rain",
  },
  {
    name: "thursday",
    speed: 50,
    interval: 1.0,
    products: [
      { model: "boot", weight: 0.6 },
      { model: "brick", weight: 0.25 },
      { model: "banana", weight: 0.15 },
    ],
    defects: ["hole", "short", "colour", "toe", "sole", "crack", "dark", "cracked"],
    defectRate: 0.36,
    flips: true,
    seconds: 60,
    memo: "the telephone division starts today. same belt.",
    weather: "clear",
  },
  {
    name: "friday",
    speed: 60,
    interval: 0.85,
    products: [
      { model: "brick", weight: 0.55 },
      { model: "banana", weight: 0.37 },
      { model: "boot", weight: 0.08 },
    ],
    foreign: ["boot"],
    defects: ["dark", "cracked", "keys"],
    defectRate: 0.34,
    flips: true,
    seconds: 60,
    memo: "we make phones now. we have always made phones.",
    weather: "storm",
  },
];

/** Pick from weighted choices with one uniform draw. */
export const pickModel = (products: Product[], roll: number): Model => {
  const total = products.reduce((sum, p) => sum + p.weight, 0);
  let at = roll * total;
  for (const p of products) {
    at -= p.weight;
    if (at < 0) return p.model;
  }
  return products[products.length - 1].model;
};
