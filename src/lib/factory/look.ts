import banana from "$lib/sprites/banana.json";
import boot from "$lib/sprites/boot.json";
import bot from "$lib/sprites/bot.json";
import foreman from "$lib/sprites/foreman.json";
import fx from "$lib/sprites/fx.json";
import phone from "$lib/sprites/phone.json";
import { type Flip, frameOf, type Sprite } from "$lib/sprites/sprite";
import worker from "$lib/sprites/worker.json";

import type { Defect, Model } from "./days";

export const SPRITES = {
  boot: boot as Sprite,
  bot: bot as Sprite,
  phone: phone as Sprite,
  banana: banana as Sprite,
  worker: worker as Sprite,
  foreman: foreman as Sprite,
  fx: fx as Sprite,
};

export type Look = { sprite: Sprite; frame: number; variant?: string; flip?: Flip };

export type Thing = { model: Model; defect: Defect | null; cover?: string };

const SPRITE_OF: Record<Model, keyof typeof SPRITES> = {
  boot: "boot",
  brick: "phone",
  banana: "banana",
};

/**
 * How an item is drawn. Defects are frames or variants of its model's sprite. `xray`
 * is how TÄ'h sees it: shape only, so a green boot looks fine and it knows anyway.
 */
export const lookOf = (item: Thing, flipped = false, xray = false): Look => {
  const sprite = SPRITES[SPRITE_OF[item.model]];
  const { defect } = item;
  const framed = defect && defect !== "colour" && defect !== "foreign";
  const frame = framed ? frameOf(sprite, defect, 0) : 0;
  const variant = xray ? "xray" : defect === "colour" ? "green" : item.cover;
  return { sprite, frame, variant, flip: flipped ? "v" : undefined };
};

/** A representative item showing a defect, for the memo's examples. */
export const exampleOf = (defect: Defect | null, model: Model = "boot"): Thing => {
  if (defect === "foreign") return { model: "boot", defect };
  if (defect === "dark" || defect === "cracked" || defect === "keys") {
    return { model: "brick", defect };
  }
  return { model, defect };
};

export const DEFECT_LABEL: Record<Defect, string> = {
  hole: "hole",
  short: "short leg",
  colour: "green",
  toe: "no toe",
  sole: "no sole",
  crack: "crack",
  dark: "dark screen",
  cracked: "cracked screen",
  keys: "missing keys",
  foreign: "not a phone",
};
