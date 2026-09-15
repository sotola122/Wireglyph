import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  detectWireglyphKind,
  parseMemoryMapDSL,
  parseRegisterMapDSL,
  renderMemoryMapSVG,
  renderRegisterMapSVG,
} from "../src/index.ts";

function regionY(svg: string, label: string): number {
  const tag = svg.match(
    new RegExp(`<rect\\b([^>]*data-memory-region="${label}"[^>]*)\\/?>`),
  );
  const y = /(?:^|\s)y="([^"]+)"/.exec(tag?.[1] ?? "")?.[1];
  return Number(y);
}

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

  test("register fields show bit counts", () => {
    const svg = renderRegisterMapSVG(register);
    expect(svg).toContain("<svg");
    expect(svg).toContain("CTRL");
    expect(svg).toContain("ENABLE");
    expect((svg.match(/<svg\b/g) ?? []).length).toBe(1);
    expect(svg).toContain("8 bits");
    expect(svg).not.toContain(">8B</text>");
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

  test("renders a vertical address map with high addresses on top", () => {
    const svg = renderMemoryMapSVG(memory);
    expect(svg).toContain("<svg");
    expect(svg).toContain("SoC map");
    expect(svg).toContain("Flash");
    expect(svg).toContain("0x7FFF");
    expect(svg).toContain("0x0000");
    expect(svg).toContain("not to scale");
    expect(regionY(svg, "MMIO")).toBeLessThan(regionY(svg, "Boot ROM"));
  });

  test("marks discontinuities and keeps small firmware regions", () => {
    const nrf = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../examples/memorymap/nrf52840.memorymap"),
      "utf8",
    );
    const nrfSvg = renderMemoryMapSVG(nrf);
    expect(nrfSvg).toContain("data-memory-gap");
    expect(nrfSvg).toContain("MBR");
    expect(nrfSvg).toContain("UICR");
    expect(regionY(nrfSvg, "PPB")).toBeLessThan(regionY(nrfSvg, "MBR"));

    const firmware = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../examples/memorymap/firmware-partitions.memorymap",
      ),
      "utf8",
    );
    const firmwareSvg = renderMemoryMapSVG(firmware);
    expect(firmwareSvg).toContain("NVS settings");
    expect(firmwareSvg).toContain("MCUBoot");
    expect(firmwareSvg).toContain("64 KiB");
  });

  test("large regions use KiB/MiB size labels instead of packet NB", () => {
    const source = `memorymap
title: Flash
cols: 8
[0x00000000-0x003FFFFF] App flash @data role=mem
[0x00400000-0x00403FFF] NVS @note role=nvs
`;
    const svg = renderMemoryMapSVG(source);
    expect(svg).toContain("4 MiB");
    expect(svg).toContain("16 KiB");
    expect(svg).toContain("NVS");
    expect(svg).not.toContain(">2B</text>");
  });
});
