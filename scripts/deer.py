"""The roe buck in src/lib/sprites/deer.json, drawn by code: the body by hand as row spans and
marks, the legs by two-bone IK on a four-beat walk. Prints the sprite's nodes as JSON for
scripts/deer.mjs, which writes them into the file:

    node scripts/deer.mjs --check    # does this still draw what the file holds?
    node scripts/deer.mjs            # write it

A hand edit in dab goes back in here (a mark, a span) until --check reports no cells.
Frames 0-7 walk, 8 grazes, 9 tugs at the grass. The body is drawn whole; the far legs are
whole and draw behind it; the near legs draw over it and into its bottom rows. Colours and the
winter variant live in the file.
"""

import json
import math

W, H = 54, 50
# The walk covers this many px in one pass through its 8 frames (life.ts DEER_STRIDE), so a
# hoof on the ground moves back exactly as far as the deer moves on.
STRIDE = 22.0
STEP = STRIDE / 8
# Frames a hoof is down of the 8.
DUTY = 5
GROUND = 49.0
# The head dips a row as each front hoof lands.
NOD = {2, 6}
FRONT_LIFT = [3.0, 6.0, 3.0]
HIND_LIFT = [2.0, 3.0, 2.0]

# Body rows: (row, left, right) spans, head up.
SPANS = {
    9: [(43, 47)], 10: [(42, 48)], 11: [(42, 49)], 12: [(41, 50)], 13: [(41, 52)],
    14: [(40, 51)], 15: [(40, 50)], 16: [(39, 45)], 17: [(38, 44)], 18: [(37, 44)],
    19: [(13, 21), (36, 43)], 20: [(11, 43)], 21: [(10, 42)], 22: [(9, 41)], 23: [(9, 41)],
    24: [(8, 41)], 25: [(8, 41)], 26: [(8, 41)], 27: [(8, 40)], 28: [(9, 40)], 29: [(9, 39)],
    30: [(10, 19), (24, 38)], 31: [(11, 18), (29, 37)], 32: [(12, 17), (33, 37)],
}
# On top of the body: (x, y, palette key).
MARKS = [
    # near antler: coronet, beam, front tine, the fork at the top
    (45, 8, "A"), (46, 8, "A"), (45, 7, "A"), (46, 7, "A"), (46, 6, "A"), (46, 5, "A"),
    (47, 5, "A"), (46, 4, "A"), (48, 4, "A"), (46, 3, "A"), (48, 3, "T"), (45, 2, "A"),
    (46, 2, "A"), (44, 1, "A"), (46, 1, "A"), (44, 0, "T"), (46, 0, "T"),
    # near ear
    (41, 4, "D"), (41, 5, "D"), (42, 5, "D"), (41, 6, "D"), (42, 6, "L"), (43, 6, "D"),
    (41, 7, "D"), (42, 7, "L"), (43, 7, "D"), (42, 8, "D"), (43, 8, "L"), (44, 8, "D"),
    # eye, nose, chin
    (46, 11, "K"), (51, 13, "K"), (52, 13, "K"), (51, 14, "K"), (49, 15, "D"), (50, 15, "D"),
    # tail: its own key, `t`, so the winter coat can colour it apart from the antler tips
    (8, 23, "t"), (8, 24, "t"), (7, 25, "t"), (8, 25, "W"), (7, 26, "t"), (8, 26, "W"),
    (7, 27, "W"), (8, 27, "W"), (6, 28, "t"), (7, 28, "W"),
]

# Grazing: the same body, the neck down in front of the front legs, the muzzle in the grass.
TORSO = {y: [(x0, min(x1, 35)) for x0, x1 in runs] for y, runs in SPANS.items() if y >= 19}
GRAZE_SPANS = {
    **TORSO,
    19: [(13, 21)], 20: [(11, 37)], 21: [(10, 38)], 22: [(9, 39)], 23: [(9, 40)],
    24: [(8, 41)], 25: [(8, 41)], 26: [(8, 42)], 27: [(8, 42)], 28: [(9, 43)], 29: [(9, 43)],
    30: [(10, 19), (24, 44)], 31: [(11, 18), (29, 44)], 32: [(12, 17), (33, 45)],
    33: [(40, 45)], 34: [(41, 46)], 35: [(41, 46)], 36: [(42, 47)], 37: [(42, 47)],
    38: [(43, 48)], 39: [(43, 48)], 40: [(43, 48)], 41: [(44, 49)], 42: [(44, 49)],
    43: [(44, 49)], 44: [(45, 49)], 45: [(45, 49)], 46: [(45, 49)], 47: [(46, 49)],
    48: [(46, 49)],
}
GRAZE_MARKS = [
    # ear, up and forward off the poll
    (48, 36, "D"), (49, 35, "D"), (50, 34, "D"), (51, 33, "D"), (49, 36, "L"), (50, 35, "L"),
    (51, 34, "D"), (50, 36, "D"),
    # antler, forward off the forehead: beam, front tine down, the fork
    (49, 38, "A"), (49, 39, "A"), (50, 38, "A"), (51, 38, "A"), (52, 37, "A"), (53, 37, "T"),
    (52, 36, "T"), (51, 39, "A"), (52, 40, "T"),
    # eye, nose, chin
    (47, 41, "K"), (48, 48, "K"), (49, 48, "K"), (49, 47, "K"), (46, 46, "D"), (46, 47, "D"),
    *[m for m in MARKS if m[0] < 36 and m[1] >= 19],
]


def blank():
    return [["."] * W for _ in range(H)]


def body(g, spans, marks, dip=False):
    """The body into `g`, shaded: lit along its top, dark underneath and, head up, down the
    front of the throat and chest. `dip`: the head and the neck's top a row lower. Returns the
    spans' cells, and every cell it paints."""
    front = spans is SPANS
    low = lambda x, y: dip and x >= 36 and y <= 18
    cells = set()
    for y, runs in spans.items():
        for x0, x1 in runs:
            for x in range(x0, x1 + 1):
                cells.add((x, y + 1) if low(x, y) else (x, y))
    for x, y in cells:
        top = (x, y - 1) not in cells
        bottom = (x, y + 1) not in cells
        under = (x, y + 2) not in cells and 22 <= x <= 40 and y > 20
        edge = front and 16 <= y <= 28 and x >= 38 and (x + 1, y) not in cells
        g[y][x] = "D" if edge else "H" if top else "D" if bottom or under else "B"
    painted = set(cells)
    for x, y, ch in marks:
        x, y = (x, y + 1) if low(x, y) else (x, y)
        g[y][x] = ch
        painted.add((x, y))
    return cells, painted


def ik(root, target, a, b, forward):
    """The joint of a two-bone limb `a` + `b` long from `root` reaching for `target`, bending
    forward (a knee) or back (a hock); and the end as reached."""
    rx, ry = root
    tx, ty = target
    dx, dy = tx - rx, ty - ry
    n = math.hypot(dx, dy)
    d = min(n, a + b - 0.01)
    ux, uy = dx / n, dy / n
    al = math.acos(max(-1, min(1, (a * a + d * d - b * b) / (2 * a * d))))
    joints = []
    for s in (1, -1):
        c, si = math.cos(s * al), math.sin(s * al)
        joints.append((rx + a * (ux * c - uy * si), ry + a * (ux * si + uy * c)))
    pick = max if forward else min
    jx, jy = pick(joints, key=lambda p: p[0])
    ex, ey = tx - jx, ty - jy
    e = math.hypot(ex, ey)
    return (jx, jy), (jx + ex / e * b, jy + ey / e * b)


def seg_dist(px, py, p0, p1):
    x0, y0 = p0
    x1, y1 = p1
    vx, vy = x1 - x0, y1 - y0
    l2 = vx * vx + vy * vy
    t = max(0, min(1, ((px - x0) * vx + (py - y0) * vy) / l2)) if l2 else 0
    return math.hypot(px - (x0 + t * vx), py - (y0 + t * vy)), t, math.sqrt(l2)


def leg_cells(chain, mid, shade, hoof, point=None):
    """A leg as {cell: key}: `chain` is [(point, radius), ...] root to hoof, the upper bone in
    `mid` with its back edge in `shade`, the lower bone shaded but for its front edge, the last
    0.9 px `hoof`. `point`: a cell added behind the joint (the hock's point)."""
    hit = {}
    for y in range(H):
        for x in range(W):
            px, py = x + 0.5, y + 0.5
            for i in range(len(chain) - 1):
                (p0, r0), (p1, r1) = chain[i], chain[i + 1]
                d, t, length = seg_dist(px, py, p0, p1)
                if d <= r0 + (r1 - r0) * t:
                    is_hoof = i == len(chain) - 2 and (1 - t) * length <= 0.9
                    if (x, y) not in hit or i > hit[(x, y)][0]:
                        hit[(x, y)] = (i, is_hoof)
    if point and point not in hit:
        hit[point] = (0, False)
    rows = {}
    for x, y in hit:
        rows.setdefault(y, []).append(x)
    return {
        (x, y): (
            hoof
            if is_hoof
            else shade
            if x == min(rows[y]) or i > 0 and x != max(rows[y])
            else mid,
            i,
        )
        for (x, y), (i, is_hoof) in hit.items()
        if 0 <= x < W and 0 <= y < H
    }


def hoof_at(c, x_front, lift_by):
    """Where a hoof is `c` frames after it struck at `x_front` (body-relative), and its lift."""
    c %= 8
    if c < DUTY:
        return x_front - c * STEP, 0.0
    x_back = x_front - (DUTY - 1) * STEP
    q = (c - (DUTY - 1)) / (8 - (DUTY - 1))
    return x_back + q * (x_front - x_back), lift_by[c - DUTY]


def front_leg(hx, lift):
    elbow = (35.0 + 0.25 * (hx - 35.0), 31.0)
    knee, hoof = ik(elbow, (hx, GROUND - lift), 8.0, 10.5, True)
    return [(elbow, 2.0), (knee, 1.25), (hoof, 0.9)], None


def hind_leg(hx, lift):
    stifle = (17.5 + 0.25 * (hx - 17.0), 30.0)
    hock, hoof = ik(stifle, (hx, GROUND - lift), 10.0, 11.0, False)
    gx, gy = hock[0] - stifle[0], hock[1] - stifle[1]
    g = math.hypot(gx, gy)
    point = (int(hock[0] + gx / g * 1.2 - 0.5), int(hock[1] + gy / g * 1.2 - 0.5))
    return [(stifle, 2.3), (hock, 1.3), (hoof, 0.85)], point


def frame(k):
    """Frame `k`: the body alone, and each leg's cells as drawn in the part."""
    if k < 8:
        hind_far = hind_leg(*hoof_at(k - 4, 20.0, HIND_LIFT))
        front_far = front_leg(*hoof_at(k - 6, 39.5, FRONT_LIFT))
        hind_near = hind_leg(*hoof_at(k, 21.0, HIND_LIFT))
        front_near = front_leg(*hoof_at(k - 2, 40.5, FRONT_LIFT))
        spans, marks, dip = SPANS, MARKS, k in NOD
    else:
        hind_far, front_far = hind_leg(14.0, 0), front_leg(36.0, 0)
        hind_near, front_near = hind_leg(16.5, 0), front_leg(38.5, 0)
        spans, marks, dip = GRAZE_SPANS, GRAZE_MARKS, False
        if k == 9:
            # a tug at the grass: the head a row up
            spans = {y - (1 if y >= 36 else 0): runs for y, runs in spans.items()}
            spans[35] = [(41, 46)]
            marks = [(x, y - 1, ch) if y >= 33 and x >= 40 else (x, y, ch) for x, y, ch in marks]
    g = blank()
    cells, painted = body(g, spans, marks, dip)
    # The bottom two rows of each column: where a near leg's upper bone goes in.
    low = {}
    for x, y in cells:
        low[x] = max(low.get(x, y), y)
    into = {(x, y) for x, y in cells if y > low[x] - 2}
    far = {
        "leg_hind_far": leg_cells(*hind_far[:1], "F", "f", "k", hind_far[1]),
        "leg_front_far": leg_cells(*front_far[:1], "F", "f", "k"),
    }
    taken = set()
    near = {}
    for name, (chain, point) in (("leg_hind_near", hind_near), ("leg_front_near", front_near)):
        drawn = leg_cells(chain, "N", "n", "K", point)
        near[name] = {
            p: v
            for p, v in drawn.items()
            if (p not in painted or (p in into and v[1] == 0)) and p not in taken
        }
        taken |= set(near[name])
    legs = {n: {p: v[0] for p, v in c.items()} for n, c in {**far, **near}.items()}
    return ["".join(r) for r in g], legs


def nodes():
    frames = [frame(k) for k in range(10)]
    out = {"body": [rows for rows, _ in frames], "parts": {}}
    for name in ("leg_hind_far", "leg_front_far", "leg_hind_near", "leg_front_near"):
        per = [legs[name] for _, legs in frames]
        xs = [x for c in per for x, _ in c]
        ys = [y for c in per for _, y in c]
        x0, y0 = min(xs), min(ys)
        w, h = max(xs) - x0 + 1, max(ys) - y0 + 1
        grids = []
        for c in per:
            g = [["."] * w for _ in range(h)]
            for (x, y), ch in c.items():
                g[y - y0][x - x0] = ch
            grids.append(["".join(r) for r in g])
        out["parts"][name] = {"x": x0, "y": y0, "w": w, "h": h, "frames": grids}
    return out


if __name__ == "__main__":
    print(json.dumps(nodes()))
