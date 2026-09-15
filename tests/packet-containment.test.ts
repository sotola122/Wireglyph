import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  fitThenWrap,
  measureTextWidth,
  renderPacketSVG,
  wrapPacketText,
} from "../src/index.ts";

const examplesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../examples/packet",
);

function parseViewBox(svg: string): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const match = svg.match(/viewBox="([^"]+)"/);
  const parts = (match?.[1] ?? "0 0 0 0").split(/\s+/).map(Number);
  return { x: parts[0] ?? 0, y: parts[1] ?? 0, width: parts[2] ?? 0, height: parts[3] ?? 0 };
}

function parseTexts(svg: string): {
  text: string;
  x: number;
  fontSize: number;
  anchor: string;
}[] {
  const runs: { text: string; x: number; fontSize: number; anchor: string }[] = [];
  const pattern = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
  let match = pattern.exec(svg);
  while (match) {
    const attrs = match[1] ?? "";
    const body = match[2] ?? "";
    const x = Number(/x="([^"]+)"/.exec(attrs)?.[1] ?? 0);
    const fontSize = Number(/font-size="([^"]+)"/.exec(attrs)?.[1] ?? 0);
    const anchor = /text-anchor="([^"]+)"/.exec(attrs)?.[1] ?? "start";
    const tspans = [...body.matchAll(/<tspan\b[^>]*>([\s\S]*?)<\/tspan>/g)].map(
      (item) => item[1] ?? "",
    );
    const lines = tspans.length > 0 ? tspans : [body.replace(/<[^>]+>/g, "")];
    for (const line of lines) {
      const text = line.replace(/<[^>]+>/g, "");
      if (text.trim()) runs.push({ text, x, fontSize, anchor });
    }
    match = pattern.exec(svg);
  }
  return runs;
}

describe("packet text wrap", () => {
  test("wraps a first token that is wider than the cell", () => {
    const lines = wrapPacketText("Opcode", 40, 28);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(measureTextWidth(line, 28)).toBeLessThanOrEqual(40 + 1e-6);
    }
  });

  test("keeps bit ranges as one token when they fit", () => {
    const lines = wrapPacketText("bit[12-0]", 400, 12);
    expect(lines).toEqual(["bit[12-0]"]);
  });

  test("shrinks then wraps down to the font floor", () => {
    const fitted = fitThenWrap("Opcode", 80, 40, 12);
    expect(fitted.fontSize).toBeGreaterThanOrEqual(12);
    expect(fitted.fontSize).toBeLessThanOrEqual(40);
    for (const line of fitted.lines) {
      expect(measureTextWidth(line, fitted.fontSize)).toBeLessThanOrEqual(80 + 1e-6);
    }
  });
});

describe("packet example field containment", () => {
  const files = readdirSync(examplesDir)
    .filter((name) => name.endsWith(".packet"))
    .sort();

  test("examples include the reviewed overflow labels", () => {
    const joined = files
      .map((file) => readFileSync(join(examplesDir, file), "utf8"))
      .join("\n");
    expect(joined).toContain("Opcode");
    expect(joined).toContain("bmRequestType");
    expect(joined).toContain("CRCDelimit");
  });

  for (const file of files) {
    test(`${file} keeps field text inside the viewBox`, () => {
      const source = readFileSync(join(examplesDir, file), "utf8");
      const svg = renderPacketSVG(source, { paginate: false, standalone: true });
      const viewBox = parseViewBox(svg);
      expect(svg).not.toMatch(/NaN|Infinity/);
      const pad = 0.75;
      for (const run of parseTexts(svg)) {
        const width = measureTextWidth(run.text, run.fontSize);
        const left = run.anchor === "middle" ? run.x - width / 2 : run.x;
        const right =
          run.anchor === "end"
            ? run.x
            : run.anchor === "middle"
              ? run.x + width / 2
              : run.x + width;
        expect(left, `${file} "${run.text}" left`).toBeGreaterThanOrEqual(
          viewBox.x - pad,
        );
        expect(right, `${file} "${run.text}" right`).toBeLessThanOrEqual(
          viewBox.x + viewBox.width + pad,
        );
      }
      if (file.includes("ble-att")) expect(svg).toContain("Opcode");
      if (file.includes("usb-control")) expect(svg).toContain("bmRequestType");
    });
  }
});
