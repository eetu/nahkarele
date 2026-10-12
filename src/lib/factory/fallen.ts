// Boots that tip off the belt, in a physics world (korpi `physics`): let go where they tip,
// falling under gravity onto the floor, landing on a heel or a toe, tipping and toppling or
// rocking back onto the sole, until they lie still; taken out as a bot picks one up. Drawn, not
// counted: the engine says where a boot is and when it is gone.

import { hash } from "@anarkisti/korpi/core";
import { type Shape, type World, worldOf } from "@anarkisti/korpi/physics";

import { BELT_Y, type FactoryState, type Item, ITEM_W } from "./engine";
import { lookOf } from "./look";
import { type Models, solid } from "./models";

/** Scene px to the metre (the models' voxel), and the floor's row where a boot rests. */
const PX_M = 40;
const FLOOR_Y = 169;

/** A capsule from voxel (ax, ay) to (bx, by), `r` voxels round, `m` kg. */
const capsule = (ax: number, ay: number, bx: number, by: number, r: number, m: number): Shape => ({
  kind: "capsule",
  ax: ax / PX_M,
  ay: ay / PX_M,
  bx: bx / PX_M,
  by: by / PX_M,
  r: r / PX_M,
  m,
});

/** The boot's body in its own frame, voxels from the sprite's middle (y up): the shaft and the
 *  foot, each a capsule, the shaft the heavier. */
const BOOT = [capsule(-3, 5, -3, -2, 3, 0.6), capsule(-2.5, -4.5, 3.5, -4.5, 3.5, 0.4)];

export type Fallen = {
  /** Bodies for what has tipped off since, out for what has been picked up, and the world on
   *  to the shift's time. Whether `item` is one of them. */
  step: (s: FactoryState) => void;
  has: (item: Item) => boolean;
  /** Each as it lies or falls now. */
  paint: (s: FactoryState, models: Models) => void;
};

export const fallenOf = (): Fallen => {
  let world: World = worldOf({ ground: { floor: () => 0 } });
  let shift: FactoryState | null = null;
  const bodies = new Map<number, number>();
  return {
    step: (s) => {
      // A new shift starts its clock again: a new world for it.
      if (s !== shift) {
        world = worldOf({ ground: { floor: () => 0 } });
        bodies.clear();
        shift = s;
      }
      for (const [id, body] of bodies) {
        if (s.items.some((i) => i.id === id && i.stage === "floor")) continue;
        world.remove(body);
        bodies.delete(id);
      }
      for (const item of s.items) {
        if (item.stage !== "floor" || bodies.has(item.id) || !solid(lookOf(item).sprite)) continue;
        // Over the belt's edge as it tips: a little way on, turning one way or the other.
        const way = hash(item.id, 1) < 0.5 ? -1 : 1;
        bodies.set(
          item.id,
          world.add({
            shapes: BOOT,
            x: (item.x + ITEM_W / 2) / PX_M,
            y: (FLOOR_Y - (BELT_Y - ITEM_W / 2)) / PX_M,
            vx: way * (0.05 + 0.1 * hash(item.id, 2)),
            spin: way * (5 + 4 * hash(item.id, 3)),
            friction: 0.8,
            bounce: 0.2,
          }),
        );
      }
      world.to(s.t, 8);
    },
    has: (item) => bodies.has(item.id),
    paint: (s, models) => {
      for (const item of s.items) {
        const body = bodies.get(item.id);
        const now = body === undefined ? null : world.get(body);
        if (!now) continue;
        models.paint(lookOf(item), now.x * PX_M, FLOOR_Y - now.y * PX_M, { roll: now.angle });
      }
    },
  };
};
