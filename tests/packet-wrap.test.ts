import { describe, expect, test } from "vitest";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePacketDSL, renderPacketSVG, renderPacketSVGPages } from "../src/index.ts";

const wrapDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/packet-wrap",
);

describe("packet wrap 256/1024", () => {
  const files = readdirSync(wrapDir)
    .filter((name) => name.endsWith(".packet"))
    .sort();

  test("records 256B wrap16 and 1024B wrap32 fixtures", () => {
    expect(files).toEqual([
      "data-packet-1024b-wrap32.packet",
      "data-packet-256b-wrap16.packet",
    ]);
  });

  for (const file of files) {
    test(file, () => {
      const source = readFileSync(join(wrapDir, file), "utf8");
      const parsed = parsePacketDSL(source);
      expect(parsed.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
      const pages = renderPacketSVGPages(source, {
        contentWidthMm: 180,
        contentHeightMm: 261,
        minFontPt: 8,
      });
      expect(pages.pages.length).toBeGreaterThanOrEqual(file.includes("1024") ? 3 : 1);
      const text = pages.pages.map((page) => page.svg).join("\n");
      expect(text).toContain("<svg");
      expect(text).not.toContain("<script");
      expect(text).not.toContain("foreignObject");
      expect(pages.pages.every((page) => page.byteRanges.length > 0)).toBe(true);
      expect(pages.pages[0]?.pageIndex).toBe(1);
    });
  }

  test("records cold/warm render cost for wrap sizes", () => {
    const results = files.map((file) => {
      const source = readFileSync(join(wrapDir, file), "utf8");
      const before = process.memoryUsage().heapUsed;
      const t0 = performance.now();
      const svg = renderPacketSVG(source, { paginate: false });
      const warm0 = performance.now();
      renderPacketSVG(source, { paginate: false });
      const warmMs = performance.now() - warm0;
      const pages = renderPacketSVGPages(source, {
        contentWidthMm: 180,
        contentHeightMm: 261,
        minFontPt: 8,
      });
      return {
        name: file,
        coldMs: Number((warm0 - t0).toFixed(1)),
        warmMs: Number(warmMs.toFixed(1)),
        heapDeltaBytes: process.memoryUsage().heapUsed - before,
        svgBytes: svg.length,
        pageCount: pages.pages.length,
        runtime: `node ${process.version}`,
      };
    });
    const recorded = join(
      dirname(fileURLToPath(import.meta.url)),
      "../.tmp/packet-wrap-perf.json",
    );
    mkdirSync(dirname(recorded), { recursive: true });
    writeFileSync(recorded, `${JSON.stringify(results, null, 2)}\n`);
    expect(results[0]?.coldMs).toBeLessThan(30_000);
  });
});
