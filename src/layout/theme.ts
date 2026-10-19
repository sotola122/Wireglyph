import { WireglyphError } from "../errors.ts";
import { validateCssFontFamily } from "../shared/svg-ids.ts";
import {
  PACKET_A4_BODY_WIDTH_MM,
  PACKET_A4_MIN_LABEL_PT,
  PACKET_LAYOUT_WIDTH,
  PACKET_PT_PER_MM,
  svgParityTokens,
} from "./tokens.ts";

const DEFAULT_FONT = "'Noto Sans CJK JP','Yu Gothic','Meiryo',Arial,sans-serif";
const DEFAULT_FONTS = { ...svgParityTokens.fonts };
const FLOOR_KEYS = new Set(["size", "badge", "detailBody"]);

export type PacketFontSizes = {
  -readonly [K in keyof typeof svgParityTokens.fonts]: number
};
/** Colour values are plain hex strings so callers can supply theme-derived values. */
export type PacketColors = {
  -readonly [K in keyof typeof svgParityTokens.colors]: string;
};

export type PacketThemeOptions = {
  readonly fontFamily?: string;
  readonly fontSizes?: Partial<Record<string, number>>;
  readonly contentWidthMm?: number;
  readonly minFontPt?: number;
  /**
   * Per-call colour overrides. Document toolchains derive these from their own
   * theme tokens so a diagram does not keep the neutral grey palette while the
   * surrounding page uses a brand colour.
   */
  readonly colors?: Partial<PacketColors>;
};

export type ResolvedPacketTheme = {
  readonly fonts: PacketFontSizes;
  readonly fontFamily: string;
  readonly colors: PacketColors;
  readonly printScale: number;
  readonly minFontFloor: number;
};

function authoredSize(
  key: keyof PacketFontSizes,
  overrides?: Partial<Record<string, number>>,
): number {
  const override = overrides?.[key];
  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    return override;
  }
  return DEFAULT_FONTS[key];
}

export function resolvePacketTheme(
  options: PacketThemeOptions = {},
): ResolvedPacketTheme {
  const contentWidthMm = options.contentWidthMm ?? PACKET_A4_BODY_WIDTH_MM;
  const printWidthPt = contentWidthMm * PACKET_PT_PER_MM;
  const printScale = PACKET_LAYOUT_WIDTH / printWidthPt;
  const minFontPt = options.minFontPt ?? PACKET_A4_MIN_LABEL_PT;
  const minFontFloor = minFontPt * printScale;
  const fonts = { ...DEFAULT_FONTS } as PacketFontSizes;
  for (const key of Object.keys(DEFAULT_FONTS) as (keyof PacketFontSizes)[]) {
    const scaled = authoredSize(key, options.fontSizes) * printScale;
    const applied = FLOOR_KEYS.has(key) ? Math.max(scaled, minFontFloor) : scaled;
    fonts[key] = Number(applied.toFixed(4));
  }
  if (fonts.label < minFontFloor) {
    throw new WireglyphError(
      "PKT_E_MIN_FONT: packet label size would print below the minimum font floor; increase content width or label size.",
      [
        {
          code: "PKT_E_MIN_FONT",
          severity: "error",
          message: `label ${fonts.label} < floor ${minFontFloor}`,
        },
      ],
    );
  }
  return {
    fonts,
    fontFamily: validateCssFontFamily(
      options.fontFamily?.trim() || DEFAULT_FONT,
    ),
    colors: resolveColors(options.colors),
    printScale,
    minFontFloor,
  };
}

const COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * Overrides are merged key by key so a caller can tint the surfaces without
 * restating text and border colours. SVG output needs opaque hex: a CSS colour
 * function would depend on the renderer supporting it.
 */
function resolveColors(
  overrides?: Partial<PacketColors>,
): PacketColors {
  if (!overrides) return svgParityTokens.colors;
  const merged: Record<string, string> = { ...svgParityTokens.colors };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    if (!(key in merged)) {
      throw new WireglyphError(`PKT_E_COLOR: unknown colour key "${key}"`, [
        {
          code: "PKT_E_COLOR",
          severity: "error",
          message: `unknown colour key "${key}"`,
        },
      ]);
    }
    if (!COLOR_PATTERN.test(value)) {
      throw new WireglyphError(
        `PKT_E_COLOR: "${key}" must be an opaque hex colour, got "${value}"`,
        [
          {
            code: "PKT_E_COLOR",
            severity: "error",
            message: `"${key}" must be an opaque hex colour, got "${value}"`,
          },
        ],
      );
    }
    merged[key] = value;
  }
  return merged as PacketColors;
}

export { DEFAULT_FONT };
