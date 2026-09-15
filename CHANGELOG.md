# Changelog

## 0.1.2

- Wrap the first oversized token instead of painting it as one overflowing line
- Shrink field labels toward `minFontPt` before wrapping; keep hex/value/range text complete
- Draw memory maps as a vertical high-address-up band chart (`not to scale`), not a packet grid

## 0.1.1

- Wrap packet text by token with ASCII/CJK width estimates instead of 1em-per-character slicing
- Size detail panels from natural one-line content width, clamped to the page
- Resolve fonts per call (`resolvePacketTheme`); `minFontPt` floors size/badge/detailBody only
- Default detail connectors to a solid arrow marker; drop endpoint circles and the `↘ detail` badge
- Memory maps print KiB/MiB and registers print bit counts via `sizeLabel`

## 0.1.0

- Extract Packet DSL from the md-docs beautiful-mermaid fork into `@sotola122/wireglyph`.
- Split grid layout (`layout/packet.ts`) from SVG emission (`render/packet-svg.ts`).
- Keep the Packet public API used by md-docs: parse / validate / normalize / adapt / render.
- Add Register Map and Memory Map DSLs that compile onto the same packet grid.
- Throw `WireglyphError` instead of sharing `DiagramRenderError` with Mermaid.
- Add multi-pattern Packet / Register Map / Memory Map samples under `examples/` (rendered by `tests/examples.test.ts`).
