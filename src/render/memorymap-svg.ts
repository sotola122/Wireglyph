import { attr, escapeXml } from "./xml.ts";
import {
  PACKET_A4_BODY_WIDTH_MM,
  svgParityTokens as t,
} from "../layout/tokens.ts";
import { resolvePacketTheme, type PacketThemeOptions } from "../layout/theme.ts";
import { fitThenWrap, packetTextBlockHeight } from "../layout/text.ts";
import {
  formatAddressSpan,
  type MemoryMapParseResult,
  type MemoryMapRegion,
} from "../parser/memorymap.ts";

const BAND_MIN = 56;
const GAP_H = 32;
const ADDR_COL = 168;
const SIZE_COL = 150;
const PAD = 12;

type Band =
  | {
      readonly kind: "region";
      readonly region: MemoryMapRegion;
      readonly sizeLabel: string;
    }
  | {
      readonly kind: "gap";
      readonly start: number;
      readonly end: number;
    };

function hexWidth(regions: readonly MemoryMapRegion[]): number {
  const max = Math.max(
    ...regions.flatMap((region) => [region.start, region.end]),
    0,
  );
  return Math.max(4, max.toString(16).length);
}

function formatHex(value: number, digits: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(digits, "0")}`;
}

function fillFor(preset: string, colors: typeof t.colors): string {
  switch (preset) {
    case "accent":
      return "#e8eaef";
    case "note":
      return "#f4f5f7";
    case "warn":
      return "#f7f1e8";
    case "error":
      return "#f6ecec";
    case "fixed":
      return "#eceef2";
    case "muted":
      return "#fafafa";
    default:
      return colors.fieldBg;
  }
}

function toBands(regions: readonly MemoryMapRegion[]): Band[] {
  const ordered = [...regions].sort((a, b) => b.start - a.start);
  const bands: Band[] = [];
  for (let i = 0; i < ordered.length; i += 1) {
    const region = ordered[i]!;
    bands.push({
      kind: "region",
      region,
      sizeLabel: formatAddressSpan(region.start, region.end),
    });
    const next = ordered[i + 1];
    if (next && region.start > next.end + 1) {
      bands.push({ kind: "gap", start: next.end + 1, end: region.start - 1 });
    }
  }
  return bands;
}

export function renderMemoryMapFromParse(
  parsed: MemoryMapParseResult,
  options: PacketThemeOptions & {
    readonly idPrefix?: string;
    readonly contentWidthMm?: number;
    readonly standalone?: boolean;
  } = {},
): string {
  const theme = resolvePacketTheme(options);
  const digits = hexWidth(parsed.regions);
  const bands = toBands(parsed.regions);
  const inner = t.width - t.marginX * 2;
  const labelWidth = Math.max(48, inner - ADDR_COL - SIZE_COL - PAD * 2);
  const titleFit = fitThenWrap(
    parsed.ast.title,
    inner - 28,
    theme.fonts.title,
    theme.minFontFloor,
  );
  const metaFit = parsed.ast.meta
    ? fitThenWrap(
        parsed.ast.meta,
        inner - 28,
        theme.fonts.meta,
        theme.minFontFloor,
      )
    : { lines: [] as string[], fontSize: theme.fonts.meta };
  const titleH = Math.max(
    t.titleHeight,
    t.pageHeader.title.paddingTop +
      packetTextBlockHeight(
        titleFit.lines,
        titleFit.fontSize,
        titleFit.fontSize * 1.25,
      ) +
      t.pageHeader.title.paddingBottom,
  );
  const metaH = parsed.ast.meta
    ? Math.max(
        t.metaHeight,
        t.pageHeader.meta.paddingTop +
          packetTextBlockHeight(
            metaFit.lines,
            metaFit.fontSize,
            metaFit.fontSize * 1.25,
          ) +
          t.pageHeader.meta.paddingBottom,
      )
    : t.metaHeight;
  const captionH = 22;
  let y = t.pageHeader.top;
  const titleY = y;
  y += titleH;
  const metaY = y;
  y += metaH + 8;
  const captionY = y;
  y += captionH + 10;
  const bandLayouts: {
    band: Band;
    y: number;
    height: number;
    labelLines: readonly string[];
    labelFontSize: number;
  }[] = [];
  for (const band of bands) {
    if (band.kind === "gap") {
      bandLayouts.push({
        band,
        y,
        height: GAP_H,
        labelLines: [],
        labelFontSize: theme.fonts.label,
      });
      y += GAP_H + 6;
      continue;
    }
    const fitted = fitThenWrap(
      band.region.label,
      labelWidth,
      theme.fonts.label,
      theme.minFontFloor,
    );
    const height = Math.max(
      BAND_MIN,
      16 +
        packetTextBlockHeight(
          fitted.lines,
          fitted.fontSize,
          fitted.fontSize * 1.4,
        ),
    );
    bandLayouts.push({
      band,
      y,
      height,
      labelLines: fitted.lines,
      labelFontSize: fitted.fontSize,
    });
    y += height + 6;
  }
  const height = y + 20;
  const contentWidthMm = options.contentWidthMm ?? PACKET_A4_BODY_WIDTH_MM;
  const mmHeight = Number(((height / t.width) * contentWidthMm).toFixed(4));
  const rootId = options.idPrefix ? `${options.idPrefix}memorymap` : undefined;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg"${attr({
      id: rootId,
      viewBox: `0 0 ${t.width} ${height}`,
      role: "img",
      "aria-label": parsed.ast.title,
      class: "memory-map-svg",
      width: `${contentWidthMm}mm`,
      height: `${mmHeight}mm`,
    })}>`,
  );
  parts.push(
    `<style><![CDATA[.memory-map-svg text{font-family:${theme.fontFamily};}]]></style>`,
  );
  const x = t.marginX;
  parts.push(
    `<rect${attr({
      x,
      y: titleY,
      width: inner,
      height: titleH,
      rx: 4,
      fill: theme.colors.titleBg,
      stroke: theme.colors.border,
      "stroke-width": t.borderWidth,
    })}/>`,
  );
  parts.push(
    textBlock(x + 14, titleY + t.pageHeader.title.paddingTop + titleFit.fontSize, titleFit.lines, {
      size: titleFit.fontSize,
      weight: 700,
      fill: theme.colors.text,
      lineHeight: titleFit.fontSize * 1.25,
      fontFamily: theme.fontFamily,
    }),
  );
  parts.push(
    `<rect${attr({
      x,
      y: metaY,
      width: inner,
      height: metaH,
      fill: theme.colors.metaBg,
      stroke: theme.colors.border,
      "stroke-width": t.borderWidth,
    })}/>`,
  );
  if (parsed.ast.meta) {
    parts.push(
      textBlock(x + 14, metaY + t.pageHeader.meta.paddingTop + metaFit.fontSize, metaFit.lines, {
        size: metaFit.fontSize,
        fill: theme.colors.muted,
        lineHeight: metaFit.fontSize * 1.25,
        fontFamily: theme.fontFamily,
      }),
    );
  }
  parts.push(
    `<text${attr({
      x: x + 14,
      y: captionY + 16,
      "font-size": theme.fonts.badge,
      fill: theme.colors.muted,
      "font-family": theme.fontFamily,
    })}>address axis vertical · high address up · not to scale</text>`,
  );

  for (const item of bandLayouts) {
    if (item.band.kind === "gap") {
      const midY = item.y + item.height / 2;
      parts.push(
        `<rect${attr({
          x,
          y: item.y,
          width: inner,
          height: item.height,
          fill: "#fafafa",
          stroke: theme.colors.border,
          "stroke-width": 1,
          "stroke-dasharray": "4 4",
          "data-memory-gap": `${formatHex(item.band.start, digits)}-${formatHex(item.band.end, digits)}`,
        })}/>`,
      );
      parts.push(
        `<text${attr({
          x: x + inner / 2,
          y: midY + 4,
          "font-size": theme.fonts.badge,
          fill: theme.colors.muted,
          "text-anchor": "middle",
          "font-family": theme.fontFamily,
        })}>gap ${formatHex(item.band.start, digits)}–${formatHex(item.band.end, digits)}</text>`,
      );
      continue;
    }
    const { region, sizeLabel } = item.band;
    parts.push(
      `<rect${attr({
        x,
        y: item.y,
        width: inner,
        height: item.height,
        rx: 3,
        fill: fillFor(region.preset, theme.colors),
        stroke: theme.colors.border,
        "stroke-width": t.borderWidth,
        "data-memory-region": region.label,
      })}/>`,
    );
    parts.push(
      `<text${attr({
        x: x + 12,
        y: item.y + 20,
        "font-size": theme.fonts.size,
        fill: theme.colors.muted,
        "font-family": theme.fontFamily,
      })}>${escapeXml(formatHex(region.end, digits))}</text>`,
    );
    parts.push(
      `<text${attr({
        x: x + 12,
        y: item.y + item.height - 10,
        "font-size": theme.fonts.size,
        fill: theme.colors.muted,
        "font-family": theme.fontFamily,
      })}>${escapeXml(formatHex(region.start, digits))}</text>`,
    );
    const labelX = x + ADDR_COL;
    let labelY = item.y + 22;
    for (const line of item.labelLines) {
      parts.push(
        `<text${attr({
          x: labelX,
          y: labelY,
          "font-size": item.labelFontSize,
          "font-weight": 700,
          fill: theme.colors.text,
          "font-family": theme.fontFamily,
        })}>${escapeXml(line)}</text>`,
      );
      labelY += item.labelFontSize * 1.4;
    }
    parts.push(
      `<text${attr({
        x: x + inner - 12,
        y: item.y + item.height / 2 - 4,
        "font-size": theme.fonts.size,
        fill: theme.colors.muted,
        "text-anchor": "end",
        "font-family": theme.fontFamily,
      })}>${escapeXml(sizeLabel)}</text>`,
    );
    parts.push(
      `<text${attr({
        x: x + inner - 12,
        y: item.y + item.height / 2 + 14,
        "font-size": theme.fonts.badge,
        fill: theme.colors.accent,
        "text-anchor": "end",
        "font-family": theme.fontFamily,
      })}>${escapeXml(region.role)}</text>`,
    );
  }

  parts.push("</svg>");
  return parts.join("\n");
}

function textBlock(
  x: number,
  y: number,
  lines: readonly string[],
  options: {
    size: number;
    weight?: number;
    fill: string;
    lineHeight: number;
    fontFamily: string;
  },
): string {
  if (lines.length <= 1) {
    return `<text${attr({
      x,
      y,
      "font-size": options.size,
      "font-weight": options.weight,
      fill: options.fill,
      "font-family": options.fontFamily,
    })}>${escapeXml(lines[0] ?? "")}</text>`;
  }
  const tspans = lines
    .map(
      (line, i) =>
        `<tspan${attr({ x, dy: i === 0 ? undefined : options.lineHeight })}>${escapeXml(line)}</tspan>`,
    )
    .join("");
  return `<text${attr({
    x,
    y,
    "font-size": options.size,
    "font-weight": options.weight,
    fill: options.fill,
    "font-family": options.fontFamily,
  })}>${tspans}</text>`;
}
