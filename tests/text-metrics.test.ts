import { describe, expect, test } from "vitest";
import { measureTextWidth, wrapPacketText } from "../src/index.ts";

/**
 * Rendered advance widths in em, measured in Chromium at weight 700 against
 * 'Noto Sans CJK JP' (the first family of the default packet font stack).
 *
 * `measureTextWidth` must never report less than these: fit-then-wrap and the
 * containment checks trust the estimate as an upper bound. A flat 0.6em per
 * ASCII character under-reported these strings and was the root cause of the
 * register and packet label collisions.
 */
const RENDERED_EM: Readonly<Record<string, number>> = {
  UNDERRUN: 5.688,
  OVERRUN: 4.865,
  Identification: 6.708,
  VALUE_WITH_DESCENDERS_gy: 15.309,
  "0x68F21A10": 5.918,
  "bit[12-0]": 4.265,
  "1 bit": 2.186,
  "8 bits": 2.681,
  bmRequestType: 8.074,
  CRCDelimit: 5.598,
  VerIHL: 3.301,
  FIFOHalf: 4.305,
  Reserved: 4.577,
  Opcode: 3.792,
  Checksum: 5.104,
  MODE: 2.952,
  ENABLE: 3.879,
  FAULT: 3.177,
  WWWW: 3.66,
  MMM: 2.559,
};

describe("text measurement bound", () => {
  for (const [text, renderedEm] of Object.entries(RENDERED_EM)) {
    test(`estimate covers the rendered width of ${JSON.stringify(text)}`, () => {
      expect(measureTextWidth(text, 100)).toBeGreaterThanOrEqual(renderedEm * 100);
    });
  }

  test("keeps CJK glyphs at one em", () => {
    expect(measureTextWidth("日本語パケット", 100)).toBeCloseTo(700, 6);
  });

  test("still reports an upper bound after wrapping", () => {
    const lines = wrapPacketText("UNDERRUN", 60, 28);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(measureTextWidth(line, 28)).toBeLessThanOrEqual(60 + 1e-6);
    }
  });
});
