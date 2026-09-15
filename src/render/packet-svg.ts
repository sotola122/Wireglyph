import {
  svgParityTokens as t,
  columnWidth,
  usableWidth,
  PACKET_A4_BODY_WIDTH_MM,
} from "../layout/tokens.ts";
import { attr, escapeXml } from "./xml.ts";
import { validateCssFontFamily } from "../shared/svg-ids.ts";
import type {
  Box,
  ByteRange,
  DetailPanelMeasure,
  NormalizedPacketDiagram,
  NormalizedPacketField,
  Point,
  RenderedSvgPage,
} from "../model/packet-diagram.ts";
import {
  applyPacketSvgFontSizeOverrides,
  fieldsInLine,
  formatRange,
  intersect,
  layoutPacketPages,
  layoutPacketPagesRaw,
  measurePageHeader,
  PACKET_PAGE_BODY_BUDGET_PX,
  packetPageContentBudgetHeight,
  rangeSize,
  restorePacketSvgFontSizes,
  type ConnectorLayout,
  type FieldTextLayout,
  type LineGroupLayout,
  type PacketPageLayout,
  type PacketSvgRenderOptions,
} from "../layout/packet.ts";

export type { PacketSvgRenderOptions } from "../layout/packet.ts";
export {
  PACKET_PAGE_BODY_BUDGET_PX,
  packetPageContentBudgetHeight,
  layoutPacketPages,
};

const DEFAULT_FONT = "'Noto Sans CJK JP','Yu Gothic','Meiryo',Arial,sans-serif";
let currentFontFamily = DEFAULT_FONT;

function getPacketSvgFontFamily(): string {
  return currentFontFamily;
}

const rect = (
  box: Box,
  options: {
    fill: string;
    stroke?: string;
    strokeWidth?: number;
    rx?: number;
    class?: string;
  },
): string => {
  const base = `<rect${attr({ x: box.x, y: box.y, width: box.width, height: box.height, rx: options.rx, fill: options.fill, stroke: options.stroke ?? t.colors.border, "stroke-width": options.strokeWidth ?? t.borderWidth })}`;
  return options.class ? `${base} class="${options.class}"/>` : `${base}/>`;
};

const line = (
  from: Point,
  to: Point,
  options: { stroke?: string; strokeWidth?: number; dash?: string } = {},
): string =>
  `<line${attr({ x1: from.x, y1: from.y, x2: to.x, y2: to.y, stroke: options.stroke ?? t.colors.border, "stroke-width": options.strokeWidth ?? t.borderWidth, "stroke-dasharray": options.dash })}/>`;

const text = (
  x: number,
  y: number,
  body: string,
  options: {
    size: number;
    weight?: string | number;
    fill?: string;
    anchor?: "start" | "middle" | "end";
  } = { size: 10 },
): string =>
  `<text${attr({ x, y, "font-size": options.size, "font-weight": options.weight, fill: options.fill ?? t.colors.text, "text-anchor": options.anchor ?? "start", "font-family": getPacketSvgFontFamily() })}>${escapeXml(body)}</text>`;

function renderLines(
  lines: readonly string[],
  x: number,
  y: number,
  options: {
    size: number;
    weight?: string | number;
    fill?: string;
    anchor?: "start" | "middle" | "end";
    lineHeight?: number;
  },
): string {
  const lineHeight = options.lineHeight ?? options.size * 1.4;
  if (lines.length <= 1) {
    return text(x, y, lines[0] ?? "", options);
  }
  const tspans = lines
    .map((lineItem, i) => {
      const attrs: Record<string, string | number | undefined | null> = {};
      attrs.x = x;
      if (i > 0) attrs.dy = lineHeight;
      return `<tspan${attr(attrs)}>${escapeXml(lineItem)}</tspan>`;
    })
    .join("");
  return `<text${attr({
    x,
    y,
    "font-size": options.size,
    "font-weight": options.weight,
    fill: options.fill ?? t.colors.text,
    "text-anchor": options.anchor ?? "start",
    "font-family": getPacketSvgFontFamily(),
  })}>${tspans}</text>`;
}

const polyline = (points: readonly Point[], kind: "dotted" | "dashed"): string =>
  `<polyline${attr({ points: points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" "), fill: "none", stroke: t.colors.connector, "stroke-width": t.connectorStrokeWidth, "stroke-dasharray": kind === "dashed" ? t.connectorDashed : t.connectorDotted, "stroke-linecap": "round", "stroke-linejoin": "round" })} data-connector-kind="${kind}"/>`;

const circle = (p: Point, r = 4): string =>
  `<circle${attr({ cx: p.x, cy: p.y, r, fill: t.colors.accent })}/>`;

function textBoundsHeight(fontSize: number): number {
  return fontSize * (1 + t.textMetrics.descent);
}

function badgeTextBaselineOffset(height: number): number {
  return (height - textBoundsHeight(t.fonts.badge)) / 2 + t.fonts.badge;
}

const badge = (
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
): string =>
  rect(
    { x, y, width, height },
    {
      fill: "#ffffff",
      stroke: t.colors.borderStrong,
      strokeWidth: t.borderWidth,
      rx: height / 2,
    },
  ) +
  text(x + width / 2, y + badgeTextBaselineOffset(height), label, {
    size: t.fonts.badge,
    weight: 700,
    fill: t.colors.accent,
    anchor: "middle",
  });

function renderField(input: {
  readonly field: NormalizedPacketField;
  readonly box: Box;
  readonly sourceRange: ByteRange;
  readonly layout: FieldTextLayout;
}): string {
  const { field, box, layout, sourceRange } = input;
  const accent = field.preset === "accent" || field.preset === "note";
  const out: string[] = [];
  out.push(
    rect(box, {
      fill: t.colors.fieldBg,
      stroke: t.colors.border,
      strokeWidth: t.borderWidth,
    }),
  );
  out.push(
    renderLines(
      layout.labelLines,
      box.x + box.width / 2,
      box.y + layout.labelBaselineOffset,
      {
        size: t.fonts.label,
        weight: 700,
        fill: accent ? t.colors.accent : t.colors.text,
        anchor: "middle",
        lineHeight: layout.labelLineHeight,
      },
    ),
  );
  out.push(
    text(
      box.x + box.width / 2,
      box.y + layout.sizeBaselineOffset,
      rangeSize(sourceRange),
      {
        size: t.fonts.size,
        fill: t.colors.muted,
        anchor: "middle",
      },
    ),
  );
  if (field.value)
    out.push(
      renderLines(
        layout.valueLines,
        box.x + box.width / 2,
        box.y + (layout.valueBaselineOffset ?? layout.sizeBaselineOffset),
        {
          size: t.fonts.value,
          fill: t.colors.text,
          anchor: "middle",
          lineHeight: t.fonts.value * t.fieldText.labelLineHeight,
        },
      ),
    );
  if (field.detail) {
    out.push(
      badge(
        box.x + box.width / 2 - 40,
        box.y + box.height - 18,
        80,
        16,
        "↘ detail",
      ),
    );
    out.push(circle({ x: box.x + box.width / 2, y: box.y + box.height }));
  }
  return out.join("\n");
}

function renderRuler(
  y: number,
  lineStart: number,
  lineEnd: number,
  rulerMode: "field" | "byte" | "none",
  packet: NormalizedPacketDiagram,
): string {
  const cols = lineEnd - lineStart + 1;
  const colW = columnWidth(cols);
  const out: string[] = [];
  out.push(
    rect(
      { x: t.marginX, y, width: usableWidth(), height: t.rulerHeight },
      { fill: "#ffffff", stroke: t.colors.border, strokeWidth: t.borderWidth },
    ),
  );
  if (rulerMode !== "field") {
    for (let i = 0; i <= cols; i += 1)
      out.push(
        line(
          { x: t.marginX + i * colW, y },
          { x: t.marginX + i * colW, y: y + t.rulerHeight },
          { stroke: t.colors.border, strokeWidth: 1 },
        ),
      );
  }

  if (rulerMode === "field") {
    const fields = fieldsInLine(packet, lineStart, lineEnd);
    for (const field of fields) {
      const segment = intersect(field.range, lineStart, lineEnd);
      if (!segment) continue;
      const segStart = segment.start;
      const segEnd = segment.end;
      const segCols = segEnd - segStart + 1;
      const segX = t.marginX + (segStart - lineStart) * colW;
      const segWidth = segCols * colW;
      out.push(
        line(
          { x: segX, y },
          { x: segX, y: y + t.rulerHeight },
          { stroke: t.colors.borderStrong, strokeWidth: 1.2 },
        ),
      );
      out.push(
        text(segX + segWidth / 2, y + 15, formatRange(segment), {
          size: t.fonts.ruler,
          weight: 700,
          fill: t.colors.text,
          anchor: "middle",
        }),
      );
    }
  } else if (rulerMode === "byte") {
    for (let i = 0; i < cols; i += 1) {
      const byteNum = lineStart + i;
      out.push(
        text(t.marginX + (i + 0.5) * colW, y + 15, `B${byteNum}`, {
          size: t.fonts.ruler,
          weight: 700,
          fill: t.colors.text,
          anchor: "middle",
        }),
      );
    }
  }
  return out.join("\n");
}

function renderDetailPanel(
  field: NormalizedPacketField,
  x: number,
  y: number,
  width: number,
  measure: DetailPanelMeasure,
): string {
  if (!field.detail) return "";
  const height = measure.height;
  const headerHeight = measure.headerHeight;
  const bodyHeight = measure.bodyHeight;
  const out: string[] = [];

  out.push(
    rect(
      { x, y, width, height },
      {
        fill: t.colors.detailBg,
        stroke: t.colors.borderStrong,
        strokeWidth: t.borderStrongWidth,
        rx: 6,
        class: "detail-panel",
      },
    ),
  );
  out.push(
    rect(
      { x, y, width, height: headerHeight },
      {
        fill: t.colors.detailHeaderBg,
        stroke: t.colors.borderStrong,
        strokeWidth: t.borderWidth,
        rx: 6,
      },
    ),
  );
  out.push(
    line(
      { x, y: y + headerHeight },
      { x: x + width, y: y + headerHeight },
      { stroke: t.colors.borderStrong, strokeWidth: t.borderWidth },
    ),
  );

  const badgeWidth = Math.min(
    140,
    Math.max(70, Array.from(measure.badgeLabel).length * t.fonts.badge + 16),
  );
  out.push(
    renderLines(measure.titleLines, x + 14, y + measure.titleBaselineOffset, {
      size: t.fonts.detailTitle,
      weight: 700,
      fill: t.colors.accent,
      lineHeight: t.fonts.detailTitle * 1.25,
    }),
  );
  out.push(
    badge(
      measure.headerStacked ? x + 14 : x + width - badgeWidth - 14,
      y + measure.badgeYOffset,
      badgeWidth,
      measure.badgeHeight,
      measure.badgeLabel,
    ),
  );

  const body = {
    x: x + t.detailPaddingX,
    y: y + measure.bodyOffsetY,
    width: width - t.detailPaddingX * 2,
    height: bodyHeight,
  };
  out.push(
    rect(body, {
      fill: "#ffffff",
      stroke: t.colors.grid,
      strokeWidth: t.borderWidth,
    }),
  );

  const rowOffset = (index: number): number =>
    measure.rowHeights.slice(0, index).reduce((sum, rowHeight) => sum + rowHeight, 0);

  if (field.detail.bitsView === "stack") {
    const c1 = body.width * 0.28;
    const c2 = body.width * 0.46;
    out.push(
      line(
        { x: body.x + c1, y: body.y },
        { x: body.x + c1, y: body.y + body.height },
        { stroke: t.colors.grid, strokeWidth: 1 },
      ),
    );
    out.push(
      line(
        { x: body.x + c1 + c2, y: body.y },
        { x: body.x + c1 + c2, y: body.y + body.height },
        { stroke: t.colors.grid, strokeWidth: 1 },
      ),
    );
    field.detail.bits.forEach((bit, i) => {
      const layout = measure.rowLayouts[i];
      const rowY = body.y + rowOffset(i);
      if (i > 0)
        out.push(
          line(
            { x: body.x, y: rowY },
            { x: body.x + body.width, y: rowY },
            { stroke: t.colors.grid, strokeWidth: 1 },
          ),
        );
      const stackRow: string[] = [
        renderLines(layout.rangeLines, body.x + 10, rowY + layout.primaryBaselineOffset, {
          size: t.fonts.detailStack,
          fill: t.colors.text,
          lineHeight: t.fonts.detailStack * t.detailPanel.stack.valueLineHeight,
        }),
        renderLines(
          layout.labelLines,
          body.x + c1 + 12,
          rowY + layout.primaryBaselineOffset,
          {
            size: t.fonts.detailStack,
            weight: 700,
            fill: t.colors.accent,
            lineHeight: t.fonts.detailStack * t.detailPanel.stack.valueLineHeight,
          },
        ),
        renderLines(
          layout.widthLines,
          body.x + body.width - 10,
          rowY + layout.primaryBaselineOffset,
          {
            size: t.fonts.detailStack,
            fill: t.colors.text,
            anchor: "end",
            lineHeight: t.fonts.detailStack * t.detailPanel.stack.valueLineHeight,
          },
        ),
      ];
      if (layout.valueLines.length) {
        stackRow.push(
          renderLines(
            layout.valueLines,
            body.x + c1 + 12,
            rowY + (layout.valueBaselineOffset ?? layout.primaryBaselineOffset),
            {
              size: t.fonts.detailBody,
              fill: t.colors.muted,
              lineHeight: t.fonts.detailBody * t.detailPanel.stack.valueLineHeight,
            },
          ),
        );
      }
      out.push(
        `<g data-bit-preset="${bit.preset}">\n${stackRow.join("\n")}\n</g>`,
      );
    });
  } else {
    const bitCols = measure.bitsColumns;
    const effectiveRows = Math.max(1, measure.rows);
    const cw = body.width / bitCols;
    for (let c = 1; c < bitCols; c += 1)
      out.push(
        line(
          { x: body.x + c * cw, y: body.y },
          { x: body.x + c * cw, y: body.y + body.height },
          { stroke: t.colors.grid, strokeWidth: 1 },
        ),
      );
    for (let r = 1; r < effectiveRows; r += 1)
      out.push(
        line(
          { x: body.x, y: body.y + rowOffset(r) },
          { x: body.x + body.width, y: body.y + rowOffset(r) },
          { stroke: t.colors.grid, strokeWidth: 1 },
        ),
      );
    field.detail.bits.forEach((bit, i) => {
      const layout = measure.rowLayouts[i];
      const c = i % bitCols;
      const r = Math.floor(i / bitCols);
      const tx = body.x + c * cw + 10;
      const rowY = body.y + rowOffset(r);
      const cellGroup: string[] = [
        renderLines(layout.rangeLines, tx, rowY + layout.primaryBaselineOffset, {
          size: t.fonts.detailBody,
          weight: 700,
          fill: t.colors.accent,
          lineHeight: t.fonts.detailBody * t.detailPanel.grid.lineHeight,
        }),
        renderLines(
          layout.labelLines,
          tx,
          rowY + (layout.secondaryBaselineOffset ?? layout.primaryBaselineOffset),
          {
            size: t.fonts.detailBody,
            fill: t.colors.text,
            lineHeight: t.fonts.detailBody * t.detailPanel.grid.lineHeight,
          },
        ),
      ];
      if (layout.valueLines.length) {
        cellGroup.push(
          renderLines(
            layout.valueLines,
            tx,
            rowY + (layout.valueBaselineOffset ?? layout.primaryBaselineOffset),
            {
              size: t.fonts.detailBody,
              fill: t.colors.muted,
              lineHeight: t.fonts.detailBody * t.detailPanel.grid.lineHeight,
            },
          ),
        );
      }
      out.push(
        `<g data-bit-preset="${bit.preset}">\n${cellGroup.join("\n")}\n</g>`,
      );
    });
  }

  return out.join("\n");
}

function joinSvgParts(...parts: readonly string[]): string {
  return parts.filter((part) => part.length > 0).join("\n");
}

function emitConnector(connector: ConnectorLayout): string {
  return joinSvgParts(polyline(connector.points, connector.kind), circle(connector.points[0]!), circle(connector.points[connector.points.length - 1]!));
}

function emitLineGroup(
  packet: NormalizedPacketDiagram,
  group: LineGroupLayout,
): { fieldSvg: string; connectorSvg: string; panelSvg: string } {
  const fieldOut: string[] = [];
  if (group.includeField) {
    fieldOut.push(
      renderRuler(group.y, group.lineStart, group.lineEnd, group.rulerMode, packet),
    );
    for (const entry of group.fields) {
      fieldOut.push(
        renderField({
          field: entry.field,
          box: entry.box,
          sourceRange: entry.sourceRange,
          layout: entry.text,
        }),
      );
    }
  }
  const connectorOut = group.connectors.map(emitConnector);
  const panelOut = group.panels.map((panel) =>
    renderDetailPanel(panel.field, panel.x, panel.y, panel.width, panel.measure),
  );
  return {
    fieldSvg: fieldOut.join("\n"),
    connectorSvg: connectorOut.join("\n"),
    panelSvg: panelOut.join("\n"),
  };
}

function composePageLayers(
  packet: NormalizedPacketDiagram,
  slices: readonly LineGroupLayout[],
): string {
  const emitted = slices.map((slice) => emitLineGroup(packet, slice));
  return joinSvgParts(
    ...emitted.map((slice) => slice.fieldSvg),
    ...emitted.map((slice) => slice.connectorSvg),
    ...emitted.map((slice) => slice.panelSvg),
  );
}

function svgUserUnit(value: number): string {
  return Number(value.toFixed(4)).toString();
}

function renderPageFromLayout(
  packet: NormalizedPacketDiagram,
  page: PacketPageLayout,
): RenderedSvgPage {
  const out: string[] = [];
  const header = page.header;
  const svgId = page.idPrefix ? `${page.idPrefix}packet-p${page.pageIndex}` : undefined;
  const svgAttrs: Record<string, string | number | undefined> = {
    id: svgId,
    viewBox: `0 0 ${t.width} ${svgUserUnit(page.height)}`,
    role: "img",
    "aria-label": `${packet.title} page ${page.pageIndex}`,
    class: "packet-diagram-svg",
  };
  if (page.widthMode === "available" && !page.standalone) {
    svgAttrs.style = "width:100%;height:auto;display:block;margin:0 auto;";
  } else {
    svgAttrs.width = `${page.contentWidthMm}mm`;
    svgAttrs.height = `${svgUserUnit((page.height / t.width) * page.contentWidthMm)}mm`;
  }
  out.push(`<svg xmlns="http://www.w3.org/2000/svg"${attr(svgAttrs)}>`);
  out.push(
    `<style><![CDATA[.packet-diagram-svg text{font-family:${getPacketSvgFontFamily()};}]]></style>`,
  );
  out.push(
    rect(header.titleBox, {
      fill: t.colors.titleBg,
      stroke: t.colors.border,
      strokeWidth: t.borderWidth,
      rx: 4,
    }),
  );
  out.push(
    renderLines(header.titleLines, t.marginX + 14, header.titleBaselineY, {
      size: t.fonts.title,
      weight: 700,
      fill: t.colors.text,
      lineHeight: t.fonts.title * t.pageHeader.title.lineHeight,
    }),
  );
  out.push(
    rect(header.metaBox, {
      fill: t.colors.metaBg,
      stroke: t.colors.border,
      strokeWidth: t.borderWidth,
    }),
  );
  if (packet.meta)
    out.push(
      renderLines(header.metaLines, t.marginX + 14, header.metaBaselineY, {
        size: t.fonts.meta,
        fill: t.colors.muted,
        lineHeight: t.fonts.meta * t.pageHeader.meta.lineHeight,
      }),
    );
  out.push(composePageLayers(packet, page.slices));
  out.push(`</svg>`);
  return {
    svg: out.join("\n"),
    pageIndex: page.pageIndex,
    title: packet.title,
    width: t.width,
    height: page.height,
    byteRanges: page.byteRanges,
  };
}

function resolvePacketSvgOptions(
  widthMode?: "available" | "fixed" | PacketSvgRenderOptions,
  standalone?: boolean,
): PacketSvgRenderOptions {
  if (widthMode && typeof widthMode === "object") return widthMode;
  const resolved: "available" | "fixed" = widthMode === "fixed" ? "fixed" : "available";
  return { widthMode: resolved, standalone };
}

export function renderPacketPages(
  packet: NormalizedPacketDiagram,
  options: PacketSvgRenderOptions = {},
): RenderedSvgPage[] {
  const savedFonts = applyPacketSvgFontSizeOverrides(options.fontSizes);
  const previousFont = currentFontFamily;
  currentFontFamily = validateCssFontFamily(
    options.fontFamily?.trim() || DEFAULT_FONT,
  );
  try {
    const pages = layoutPacketPagesRaw(packet, options);
    return pages.map((page) => renderPageFromLayout(packet, page));
  } finally {
    currentFontFamily = previousFont;
    restorePacketSvgFontSizes(savedFonts);
  }
}

export function renderPacketSvgParity(
  packet: NormalizedPacketDiagram,
  widthMode?: "available" | "fixed" | PacketSvgRenderOptions,
  standalone?: boolean,
): string {
  const options = resolvePacketSvgOptions(widthMode, standalone);
  const resolvedWidthMode: "available" | "fixed" =
    options.widthMode ?? "available";
  const pages = renderPacketPages(packet, {
    ...options,
    paginate: options.paginate ?? true,
  });
  const widthModeAttr = ` data-width-mode="${resolvedWidthMode}"`;
  const widthModeClass =
    resolvedWidthMode === "available"
      ? " packet-diagram-available"
      : " packet-diagram-fixed";
  return pages
    .map(
      (page) =>
        `<figure class="packet-diagram-figure${widthModeClass}"${widthModeAttr} data-packet-version="5" data-diagram-renderer="svg-parity" data-packet-page="${page.pageIndex}">\n${page.svg}\n</figure>`,
    )
    .join("\n");
}

void PACKET_A4_BODY_WIDTH_MM;
void measurePageHeader;
void PACKET_PAGE_BODY_BUDGET_PX;
void packetPageContentBudgetHeight;
void layoutPacketPages;
