import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderRegisterMapSVG } from "../src/index.ts";

const root = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(root, "../examples/register");

const files = readdirSync(examplesDir)
  .filter((name) => name.endsWith(".register"))
  .sort();

function render(file: string): string {
  return renderRegisterMapSVG(readFileSync(join(examplesDir, file), "utf8"), {
    standalone: true,
  });
}

function visibleTexts(svg: string): string[] {
  return [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((match) =>
    (match[1] ?? "").replace(/<[^>]+>/g, "").trim(),
  );
}

describe("register bit numbering", () => {
  for (const file of files) {
    test(`${file} labels the ruler with bit numbers`, () => {
      const svg = render(file);
      const texts = visibleTexts(svg);
      // The ruler is the first band under the title/meta; byte numbering would
      // print B1, B2, ... and is never correct for a register.
      expect(texts.some((text) => /^B\d/.test(text))).toBe(false);
      const bitLabels = texts.filter((text) => /^\d+(?::\d+)?$/.test(text));
      expect(bitLabels.length).toBeGreaterThan(0);
      // Most significant bit first: the leftmost ruler label starts at width-1.
      const width = Number(
        /^width\s*:\s*(\d+)/m.exec(
          readFileSync(join(examplesDir, file), "utf8"),
        )?.[1] ?? 0,
      );
      expect(bitLabels[0]?.split(":")[0]).toBe(String(width - 1));
    });
  }

  test("packet diagrams keep byte numbering", () => {
    const svg = renderRegisterMapSVG(
      [
        "registermap",
        "title: CTRL",
        "width: 8",
        "[7:4] MODE @data role=rw",
        "[3:0] ENABLE @accent role=rw",
      ].join("\n"),
      { standalone: true },
    );
    expect(visibleTexts(svg)).toContain("7:4");
    expect(visibleTexts(svg)).toContain("3:0");
  });
});

describe("register narrow cell presentation", () => {
  test("moves an unreadable narrow label to a callout with a leader", () => {
    const svg = renderRegisterMapSVG(
      [
        "registermap",
        "title: CTRL",
        "width: 32",
        "[31:24] Reserved @muted role=rsvd",
        "[23:16] MODE = 0x01 @data role=field",
        "[15:8] SPEED @accent role=rw",
        "[7] OVERRUN @warn role=flag",
        "[6] UNDERRUN @warn role=flag",
        "[5:0] ENABLE @fixed role=rw",
      ].join("\n"),
      { standalone: true },
    );
    const texts = visibleTexts(svg);
    // The full field name is preserved outside the cell.
    expect(texts).toContain("OVERRUN");
    expect(texts).toContain("UNDERRUN");
    // Each callout is attached to its cell by a leader.
    const leaders = [...svg.matchAll(/<polyline\b[^>]*points="([^"]+)"/g)];
    expect(leaders.length).toBeGreaterThanOrEqual(2);
  });

  test("drops a size caption that cannot fit its cell", () => {
    const svg = renderRegisterMapSVG(
      [
        "registermap",
        "title: CTRL",
        "width: 32",
        "[31:1] Reserved @muted role=rsvd",
        "[0] ENABLE @accent role=rw",
      ].join("\n"),
      { standalone: true },
    );
    // `1 bit` at the default size font cannot fit a single 32-bit column.
    expect(visibleTexts(svg)).not.toContain("1 bit");
    expect(visibleTexts(svg)).toContain("31 bits");
  });

  test("keeps a wide register cell label in place", () => {
    const svg = renderRegisterMapSVG(
      [
        "registermap",
        "title: STATUS",
        "width: 8",
        "[7] OVERRUN @warn role=flag",
        "[6:0] DATA @data role=field",
      ].join("\n"),
      { standalone: true },
    );
    const texts = visibleTexts(svg);
    expect(texts).toContain("OVERRUN");
    expect(texts).toContain("1 bit");
  });
});
