---
name: nahkarele-design
description: nahkarele's delta on the shared halo-design look — the jammed-gear glyph, the hero title in place of a wordmark, the two pixel-scene games, and the dry office-memo voice. Use when styling or adding UI to nahkarele.
user-invocable: true
---

Shared tokens and conventions come from `homebrew:halo-design`;
`src/lib/styles/halo.css` is `colors_and_type.css` verbatim, minus the Google Fonts
import (fonts are self-hosted via @fontsource). Below is this app's delta.

## Glyph

An eight-tooth gear with the accent dot wedged in one tooth gap: the relay stuck in the
machine. `src/lib/components/intro/Glyph.svelte` (`currentColor` strokes, `jam` prop animates a
turn that stalls on the dot); `static/favicon.svg` is the same geometry on an opaque
`#0f0f0f` square.

## No wordmark

A deliberate deviation from the family: there is no header wordmark. The landing hero (the
jammed gear beside a large `nahkarele.` with the accent dot) is the brand, and a second
title in a header only repeated it. The rooms have no bar at all: EXIT, WC, sound and
fullscreen are signs on the scene's walls (`src/lib/components/SceneSign.svelte`).

## Layout

- Intro: a hero (glyph + definition), two mode cards (kumitehdas, software specialist) and
  the orientation cassette.
- Both games: the pixel scene, its numbers and switches drawn in it, and the controls below
  it (stamp/pass in the factory, the desk panel in the office). Memo and review cards sit
  over the scene as pixel frames (`src/lib/styles/pixel.css`, Pixelify Sans) at the scene's
  pixel size; under 760px they drop below it.
- The cassette label is a printed paper ivory in both themes; the shell stays dark.

## Pixel scenes

The factory is a 320 × 180 scene, integer-scaled with `image-rendering: pixelated`. It keeps
its own fixed 1970s palette (beige wall, institutional green, grey steel, one red) in both
themes, like the cassette. Sprites are dab JSON in `src/lib/sprites/`; TÄ'h's x-ray is a
cyan palette variant.

## Voice

UI copy: lowercase, dry, corporate-deadpan ("clipboard disabled by policy.", "human in
the loop: compliant"). Agent messages are sentence case and terse, like memos.

## Differences from the family baseline

| Axis     | Baseline                | nahkarele                                   |
| -------- | ----------------------- | ------------------------------------------- |
| Fonts    | Google Fonts            | @fontsource, self-hosted                    |
| Wordmark | riff + name in a header | none: the landing hero is the brand         |
| Accent   | alive / active          | also the relay itself (the dot, the stamps) |
| Colours  | greys + accent          | + green "compliant", red negative value     |
