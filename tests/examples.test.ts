import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { renderWireglyphSVG } from "../src/index.ts";

const examplesRoot = join(dirname(fileURLToPath(import.meta.url)), "../examples");

const kinds = [
  { dir: "packet", ext: ".packet" },
  { dir: "register", ext: ".register" },
  { dir: "memorymap", ext: ".memorymap" },
] as const;

function listFiles(dir: string, ext: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(ext))
    .map((name) => join(dir, name))
    .sort();
}

describe("wireglyph examples", () => {
  for (const kind of kinds) {
    const dir = join(examplesRoot, kind.dir);
    test(`${kind.dir}/ contains multiple samples`, () => {
      expect(statSync(dir).isDirectory()).toBe(true);
      expect(listFiles(dir, kind.ext).length).toBeGreaterThanOrEqual(2);
    });

    for (const file of listFiles(dir, kind.ext)) {
      const rel = relative(examplesRoot, file);
      test(`renders ${rel}`, () => {
        const source = readFileSync(file, "utf8");
        const svg = renderWireglyphSVG(source, { idPrefix: `ex-${rel}-` });
        expect(svg).toContain("<svg");
        expect((svg.match(/<svg\b/g) ?? []).length).toBe(1);
        expect(svg).not.toContain("<script");
      });
    }
  }
});
