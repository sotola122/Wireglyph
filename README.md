# @sotola122/wireglyph

Deterministic binary-field diagrams: Packet DSL, register maps, and memory maps.

Pipeline: **DSL → typed AST → grid layout → SVG**. Layout is computed separately from SVG emission so pagination, field boxes, and connectors stay stable.

## Install

```bash
npm install @sotola122/wireglyph
```

GitHub Packages: `@sotola122/wireglyph`.

## Packet DSL

```ts
import {
  parsePacketDSL,
  validatePacketAst,
  normalizePacket,
  adaptToNormalizedPacketDiagram,
  renderPacketSVG,
  renderPacketSVGPages,
  renderPacketPages,
  extractPacketBlocks,
} from "@sotola122/wireglyph";

const svg = renderPacketSVG(`title: Sync
cols: 4
wrap: none
B1: Ver @data role=hdr
B2: Type @data role=typ
B3-4: Length @data role=len
`);
```

Kept compat APIs: `parsePacketDSL`, `validatePacketAst`, `normalizePacket`, `adaptToNormalizedPacketDiagram`, `renderPacketPages`, `renderPacketSVG`, `renderPacketSVGPages`, `renderPacketSvgParity`, `extractPacketBlocks`.

Errors throw `WireglyphError` with `diagnostics`.

## Register map

MSB is drawn on the left. Unspecified bits become `Reserved`.

````markdown
```registermap
title: CTRL
width: 32
offset: 0x00
[31:16] Reserved @muted role=rsvd
[15:8] MODE = 0x01 @data role=rw
[7:0] ENABLE @accent role=rw
```
````

```ts
import { parseRegisterMapDSL, renderRegisterMapSVG } from "@sotola122/wireglyph";
```

## Memory map

Address regions are scaled onto a fixed column count (default 16).

````markdown
```memorymap
title: SoC
cols: 16
[0x0000-0x00FF] Boot ROM @fixed
[0x0100-0x7FFF] Flash @data
[0x8000-0x80FF] SRAM @accent
```
````

## Examples

Complex Packet / Register Map / Memory Map samples live in [`examples/`](./examples/).
`tests/examples.test.ts` renders every file; invalid DSL fails the suite.

## Isolation

No `elkjs`, Yoga, or Mermaid runtime. SVG IDs are deterministic from `idPrefix`.
