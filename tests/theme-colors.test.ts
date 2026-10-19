import { describe, expect, test } from "vitest";
import {
  renderMemoryMapSVG,
  renderPacketSVG,
  renderRegisterMapSVG,
} from "../src/index.ts";

const packet = `title: Colour
cols: 2
wrap: none
ruler: field

B1: Header @accent role=hdr
B2: Payload @data role=data
`;

const register = `registermap
title: CTRL
width: 8
[7:4] MODE = 0x1 @data role=rw
[3:0] ENABLE @accent role=rw
`;

const memory = `memorymap
title: Map
cols: 8
[0x0000-0x00FF] Boot @fixed role=rom
[0x0100-0x0FFF] App @data role=app
`;

describe("per-call colour overrides", () => {
  test("keeps the neutral palette when no colours are given", () => {
    const svg = renderPacketSVG(packet, { standalone: true });
    expect(svg).toContain("#f4f5f7");
    expect(svg).not.toContain("#e6eff7");
  });

  test("replaces only the supplied keys", () => {
    const svg = renderPacketSVG(packet, {
      standalone: true,
      colors: { fieldBg: "#e6eff7" },
    });
    expect(svg).toContain("#e6eff7");
    // Untouched keys keep the kit default.
    expect(svg).toContain("#c5c9d1");
  });

  test("applies the palette to the title and meta bands", () => {
    const svg = renderPacketSVG(packet, {
      standalone: true,
      colors: { titleBg: "#ccdfef", metaBg: "#f0f5fa" },
    });
    expect(svg).toContain("#ccdfef");
    expect(svg).toContain("#f0f5fa");
  });

  test("register maps use the same palette", () => {
    const svg = renderRegisterMapSVG(register, {
      standalone: true,
      colors: { fieldBg: "#e6eff7", accent: "#083f71" },
    });
    expect(svg).toContain("#e6eff7");
    expect(svg).toContain("#083f71");
  });

  test("memory maps use the same palette", () => {
    const svg = renderMemoryMapSVG(memory, {
      standalone: true,
      colors: { titleBg: "#ccdfef", fieldBg: "#e6eff7" },
    });
    expect(svg).toContain("#ccdfef");
    expect(svg).toContain("#e6eff7");
  });

  test("rejects an unknown colour key", () => {
    expect(() =>
      renderPacketSVG(packet, {
        standalone: true,
        colors: { notAKey: "#ffffff" } as Record<string, string>,
      }),
    ).toThrow(/PKT_E_COLOR/);
  });

  test("rejects a non-opaque colour value", () => {
    expect(() =>
      renderPacketSVG(packet, {
        standalone: true,
        colors: { fieldBg: "rgba(0,0,0,0.2)" },
      }),
    ).toThrow(/opaque hex colour/);
  });
});
