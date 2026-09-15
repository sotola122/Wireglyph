import { describe, expect, test } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parsePacketDSL,
  renderPacketPages,
  adaptToNormalizedPacketDiagram,
  normalizePacket,
  validatePacketAst,
} from "../src/index.ts";
import type { PacketSvgRenderOptions } from "../src/index.ts";

const root = dirname(fileURLToPath(import.meta.url));
const goldenRoot = "/tmp/golden/packet";

const modes: Record<string, PacketSvgRenderOptions> = {
  "available-single": {
    widthMode: "available",
    paginate: false,
    standalone: true,
    idPrefix: "g-",
  },
  "available-paginate": {
    widthMode: "available",
    paginate: true,
    standalone: true,
    idPrefix: "g-",
  },
  "fixed-single": {
    widthMode: "fixed",
    paginate: false,
    standalone: true,
    idPrefix: "g-",
  },
  "fixed-paginate": {
    widthMode: "fixed",
    paginate: true,
    standalone: true,
    idPrefix: "g-",
  },
  "inline-fonts": {
    widthMode: "available",
    paginate: true,
    standalone: false,
    fontFamily: "Noto Sans CJK JP, sans-serif",
  },
};

function compile(source: string) {
  const parsed = parsePacketDSL(source);
  const diagnostics = [...parsed.diagnostics, ...validatePacketAst(parsed.ast)];
  if (diagnostics.some((item) => item.severity === "error")) {
    throw new Error(diagnostics.map((item) => item.message).join("\n"));
  }
  return adaptToNormalizedPacketDiagram(normalizePacket(parsed.ast, diagnostics));
}

function goldenCases(kind: "packet" | "packet-wrap"): { name: string; source: string; goldenDir: string }[] {
  const fixtureDir = join(root, "fixtures", kind);
  const files = readdirSync(fixtureDir).filter((name) => name.endsWith(".packet"));
  return files.flatMap((file) => {
    const name = file.replace(/\.packet$/, "");
    const goldenDir = join(goldenRoot, kind, name);
    if (!existsSync(goldenDir)) return [];
    return [
      {
        name,
        source: readFileSync(join(fixtureDir, file), "utf8"),
        goldenDir,
      },
    ];
  });
}

describe("packet SVG golden byte-match", () => {
  for (const kind of ["packet", "packet-wrap"] as const) {
    for (const fixture of goldenCases(kind)) {
      for (const [mode, options] of Object.entries(modes)) {
        const modeDir = join(fixture.goldenDir, mode);
        if (!existsSync(modeDir)) continue;
        test(`${kind}/${fixture.name}/${mode}`, () => {
          const diagram = compile(fixture.source);
          const pages = renderPacketPages(diagram, options);
          for (const page of pages) {
            const expectedPath = join(modeDir, `page-${page.pageIndex}.svg`);
            expect(existsSync(expectedPath), expectedPath).toBe(true);
            const expected = readFileSync(expectedPath, "utf8");
            expect(page.svg).toBe(expected);
          }
          const extra = readdirSync(modeDir).filter((name) => name.endsWith(".svg"));
          expect(extra).toHaveLength(pages.length);
        });
      }
    }
  }
});
