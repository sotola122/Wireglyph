import { describe, expect, test } from "vitest";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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

/**
 * Golden SVGs are byte-for-byte render output, so they live outside the
 * repository and the suite reports an explicit skip when they are absent.
 * Generate them with `UPDATE_PACKET_GOLDEN=1 npx vitest run tests/packet-golden.test.ts`,
 * then re-run without the variable to compare.
 */
const goldenRoot = process.env.PACKET_GOLDEN_ROOT ?? "/tmp/golden/packet";
const updating = process.env.UPDATE_PACKET_GOLDEN === "1";

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

function fixtures(kind: "packet" | "packet-wrap"): { name: string; source: string }[] {
  const fixtureDir = join(root, "fixtures", kind);
  return readdirSync(fixtureDir)
    .filter((name) => name.endsWith(".packet"))
    .sort()
    .map((file) => ({
      name: file.replace(/\.packet$/, ""),
      source: readFileSync(join(fixtureDir, file), "utf8"),
    }))
    // Fixtures that fail validation are asserted by the diagnostic suites and
    // have no rendered output to compare against.
    .filter((fixture) => {
      try {
        compile(fixture.source);
        return true;
      } catch {
        return false;
      }
    });
}

// `updating` writes goldens, so it must run even when none exist yet.
describe.skipIf(!updating && !existsSync(goldenRoot))(
  `packet SVG golden byte-match (${goldenRoot})`,
  () => {
    for (const kind of ["packet", "packet-wrap"] as const) {
      for (const fixture of fixtures(kind)) {
        for (const [mode, options] of Object.entries(modes)) {
          const modeDir = join(goldenRoot, kind, fixture.name, mode);
          if (!updating && !existsSync(modeDir)) continue;
          test(`${kind}/${fixture.name}/${mode}`, () => {
            const diagram = compile(fixture.source);
            const pages = renderPacketPages(diagram, options);
            if (updating) {
              mkdirSync(modeDir, { recursive: true });
              for (const page of pages) {
                writeFileSync(join(modeDir, `page-${page.pageIndex}.svg`), page.svg);
              }
              return;
            }
            for (const page of pages) {
              const expectedPath = join(modeDir, `page-${page.pageIndex}.svg`);
              expect(existsSync(expectedPath), expectedPath).toBe(true);
              expect(page.svg).toBe(readFileSync(expectedPath, "utf8"));
            }
            const extra = readdirSync(modeDir).filter((name) => name.endsWith(".svg"));
            expect(extra).toHaveLength(pages.length);
          });
        }
      }
    }
  },
);

if (!updating && !existsSync(goldenRoot)) {
  test.skip(`packet SVG goldens absent at ${goldenRoot}`, () => {});
}
