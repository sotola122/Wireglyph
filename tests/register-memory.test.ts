import { describe, expect, test } from "vitest";
import {
  detectWireglyphKind,
  parseMemoryMapDSL,
  parseRegisterMapDSL,
  renderMemoryMapSVG,
  renderRegisterMapSVG,
} from "../src/index.ts";

const register = `registermap
title: CTRL
meta: device control
width: 32
offset: 0x00
[31:24] Reserved @muted role=rsvd
[23:16] MODE = 0x01 @data role=field
[15:8] SPEED @accent role=rw
[7:0] ENABLE @fixed role=rw
`;

const memory = `memorymap
title: SoC map
cols: 16
[0x0000-0x00FF] Boot ROM @fixed role=rom
[0x0100-0x7FFF] Flash @data role=mem
[0x8000-0x80FF] SRAM @accent role=ram
[0x8100-0x81FF] MMIO @warn role=io
`;

describe("register map DSL", () => {
  test("detects registermap", () => {
    expect(detectWireglyphKind(register)).toBe("registermap");
  });

  test("maps MSB-left bit ranges onto packet columns", () => {
    const parsed = parseRegisterMapDSL(register);
    expect(parsed.width).toBe(32);
    expect(parsed.ast.cols).toBe(32);
    expect(parsed.ast.fields.some((field) => field.label === "MODE")).toBe(true);
    expect(parsed.ast.fields.find((field) => field.label === "ENABLE")?.range).toBe("B25-32");
  });

  test("renders SVG", () => {
    const svg = renderRegisterMapSVG(register);
    expect(svg).toContain("<svg");
    expect(svg).toContain("CTRL");
    expect(svg).toContain("ENABLE");
    expect((svg.match(/<svg\b/g) ?? []).length).toBe(1);
  });
});

describe("memory map DSL", () => {
  test("detects memorymap", () => {
    expect(detectWireglyphKind(memory)).toBe("memorymap");
  });

  test("keeps address regions and fills columns", () => {
    const parsed = parseMemoryMapDSL(memory);
    expect(parsed.regions).toHaveLength(4);
    expect(parsed.ast.cols).toBe(16);
    const covered = parsed.ast.fields.reduce((sum, field) => {
      const match = field.range.match(/^B(\d+)(?:-(\d+))?$/);
      const start = Number(match?.[1] ?? 0);
      const end = Number(match?.[2] ?? start);
      return sum + (end - start + 1);
    }, 0);
    expect(covered).toBe(16);
  });

  test("renders SVG", () => {
    const svg = renderMemoryMapSVG(memory);
    expect(svg).toContain("<svg");
    expect(svg).toContain("SoC map");
    expect(svg).toContain("Flash");
    expect(svg).toMatch(/MMI/);
  });
});
