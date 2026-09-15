# Changelog

## 0.1.0

- Extract Packet DSL from the md-docs beautiful-mermaid fork into `@sotola122/wireglyph`.
- Split grid layout (`layout/packet.ts`) from SVG emission (`render/packet-svg.ts`).
- Keep the Packet public API used by md-docs: parse / validate / normalize / adapt / render.
- Add Register Map and Memory Map DSLs that compile onto the same packet grid.
- Throw `WireglyphError` instead of sharing `DiagramRenderError` with Mermaid.
