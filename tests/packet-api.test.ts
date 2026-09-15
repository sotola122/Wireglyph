import { describe, expect, test } from "vitest";
import { WireglyphError } from "../src/errors.ts";
import {
  parsePacketDSL,
  renderPacketSVG,
  renderPacketSVGPages,
} from "../src/index.ts";
import { svgId } from "../src/shared/svg-ids.ts";

const basic = `title: Basic
cols: 4
wrap: none
B1: Ver @data role=hdr
B2: Type @data role=typ
B3-4: Length @data role=len
`;

describe("packet public API", () => {
  test("parsePacketDSL keeps Byte alias and bit value/role", () => {
    const source = `title: Bits
cols: 1
Byte1: Flags
  bitsView: detail
  bitOrder: lsb0
  bits:
  b0: bit0 = 1 @data role=flag
  b1: bit1 = 0 @data role=flag
`;
    const parsed = parsePacketDSL(source);
    expect(parsed.ast.fields[0]?.range).toBe("Byte1");
    expect(parsed.ast.fields[0]?.bits?.[0]?.value).toBe("1");
    expect(parsed.ast.fields[0]?.bits?.[0]?.role).toBe("flag");
  });

  test("renderPacketSVG emits one svg root and no figure", () => {
    const svg = renderPacketSVG(basic, { paginate: false, idPrefix: "p1-" });
    expect((svg.match(/<svg\b/g) ?? []).length).toBe(1);
    expect(svg).not.toContain("<figure");
    expect(svg).toContain('id="p1-packet-p1"');
  });

  test("renderPacketSVGPages uses 1-based pageIndex", () => {
    const result = renderPacketSVGPages(basic, {
      contentWidthMm: 180,
      contentHeightMm: 261,
    });
    expect(result.pages.length).toBeGreaterThanOrEqual(1);
    expect(result.pages[0]?.pageIndex).toBe(1);
    for (const page of result.pages) {
      expect((page.svg.match(/<svg\b/g) ?? []).length).toBe(1);
      expect(page.byteRanges.length).toBeGreaterThan(0);
    }
  });

  test("parse errors stop render", () => {
    expect(() => renderPacketSVG("not a packet")).toThrow(WireglyphError);
  });

  test("A then B then A font options do not leak", () => {
    const a = renderPacketSVG(basic, { fontFamily: "FontA, sans-serif" });
    renderPacketSVG(basic, { fontFamily: "FontB, sans-serif" });
    const aAgain = renderPacketSVG(basic, { fontFamily: "FontA, sans-serif" });
    expect(a).toBe(aAgain);
    expect(a).toContain("FontA");
  });

  test("A then B then A fontSizes do not leak", () => {
    const a = renderPacketSVG(basic, { fontSizes: { title: 18 } });
    renderPacketSVG(basic, { fontSizes: { title: 10 } });
    const aAgain = renderPacketSVG(basic, { fontSizes: { title: 18 } });
    expect(a).toBe(aAgain);
    const b = renderPacketSVG(basic, { fontSizes: { title: 10 } });
    expect(b).not.toBe(a);
  });

  test("distinct idPrefix values do not collide", () => {
    expect(svgId("a-", "title")).toBe("a-title");
    expect(svgId("b-", "title")).toBe("b-title");
  });

  test("rejects CSS-breaking fontFamily", () => {
    expect(() =>
      renderPacketSVG(basic, { fontFamily: "x; } </style>" }),
    ).toThrow();
  });
});
