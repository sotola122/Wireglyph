import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePacketDSL, renderPacketSVG } from "../src/index.ts";
import { WireglyphError } from "../src/errors.ts";

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/packet",
);

describe("packet fixture inventory", () => {
  const files = readdirSync(fixtureDir)
    .filter((name) => name.endsWith(".packet"))
    .sort();

  test("keeps the 19 md-docs svg-parity fixtures", () => {
    expect(files).toHaveLength(19);
  });

  for (const file of files) {
    test(file, () => {
      const source = readFileSync(join(fixtureDir, file), "utf8");
      const parsed = parsePacketDSL(source);
      try {
        const svg = renderPacketSVG(source);
        expect(svg).toContain("<svg");
        expect(svg).not.toContain("<script");
      } catch (error) {
        expect(error instanceof WireglyphError || parsed.diagnostics.length > 0).toBe(true);
      }
    });
  }
});
