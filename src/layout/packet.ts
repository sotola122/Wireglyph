import {
  svgParityTokens as t,
  columnWidth,
  usableWidth,
  PACKET_A4_BODY_HEIGHT_MM,
  PACKET_A4_BODY_WIDTH_MM,
  PACKET_PRINT_FONT_SCALE,
  PACKET_PT_PER_MM,
  packetSvgEmittedFontSize,
} from "./tokens.ts";
import {
  minDetailColumns,
  computeAutoDetailRange,
  measureDetailPanel,
} from "./measure.ts";
import {
  packetTextBlockHeight,
  wrapPacketText,
  textBoxWidth,
} from "./text.ts";
import type {
  Box,
  ByteRange,
  DetailPanelMeasure,
  NormalizedPacketDiagram,
  NormalizedPacketField,
  Point,
} from "../model/packet-diagram.ts";

export type PacketSvgRenderOptions = {
  widthMode?: "available" | "fixed";
  standalone?: boolean;
  paginate?: boolean;
  fontFamily?: string;
  fontSizes?: Partial<Record<string, number>>;
  idPrefix?: string;
  contentWidthMm?: number;
  contentHeightMm?: number;
};

export type FieldTextLayout = {
  readonly height: number;
  readonly labelBaselineOffset: number;
  readonly labelLineHeight: number;
  readonly labelLines: readonly string[];
  readonly sizeBaselineOffset: number;
  readonly valueBaselineOffset: number | undefined;
  readonly valueLines: readonly string[];
};

export type PageHeaderLayout = {
  readonly titleBox: Box;
  readonly titleBaselineY: number;
  readonly titleLines: readonly string[];
  readonly metaBox: Box;
  readonly metaBaselineY: number;
  readonly metaLines: readonly string[];
  readonly bodyStartY: number;
};

export type PlacedFieldLayout = {
  readonly field: NormalizedPacketField;
  readonly box: Box;
  readonly sourceRange: ByteRange;
  readonly text: FieldTextLayout;
};

export type ConnectorLayout = {
  readonly points: readonly Point[];
  readonly kind: "dotted" | "dashed";
};

export type DetailPanelPlacement = {
  readonly field: NormalizedPacketField;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly measure: DetailPanelMeasure;
};

export type LineGroupLayout = {
  readonly includeField: boolean;
  readonly rulerMode: "field" | "byte" | "none";
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly y: number;
  readonly fieldY: number;
  readonly fields: readonly PlacedFieldLayout[];
  readonly connectors: readonly ConnectorLayout[];
  readonly panels: readonly DetailPanelPlacement[];
  readonly height: number;
  readonly laneCount: number;
};

export type PacketPageLayout = {
  readonly header: PageHeaderLayout;
  readonly slices: readonly LineGroupLayout[];
  readonly height: number;
  readonly pageIndex: number;
  readonly byteRanges: readonly ByteRange[];
  readonly widthMode: "available" | "fixed";
  readonly standalone: boolean;
  readonly idPrefix: string;
  readonly contentWidthMm: number;
};

const fontSizeOverrideKeys = new Set(Object.keys(t.fonts));
const DEFAULT_FONT_SIZES: Record<string, number> = { ...t.fonts };

export const PACKET_PAGE_BODY_BUDGET_PX =
  (PACKET_A4_BODY_HEIGHT_MM * PACKET_PT_PER_MM) * PACKET_PRINT_FONT_SCALE;

export function packetPageContentBudgetHeight(
  headerBodyStartY: number,
  bottomPadding = 20,
  contentHeightMm = PACKET_A4_BODY_HEIGHT_MM,
): number {
  const totalHeightUu =
    contentHeightMm * PACKET_PT_PER_MM * PACKET_PRINT_FONT_SCALE;
  return Math.max(1, totalHeightUu - headerBodyStartY - bottomPadding);
}

function scalePacketFontSize(size: number): number {
  return packetSvgEmittedFontSize(size);
}

export function restorePacketSvgFontSizes(saved: Record<string, number>): void {
  for (const key of Object.keys(DEFAULT_FONT_SIZES)) {
    (t.fonts as Record<string, number>)[key] = saved[key] ?? DEFAULT_FONT_SIZES[key];
  }
}

export function applyPacketSvgFontSizeOverrides(
  fontSizes?: Partial<Record<string, number>>,
): Record<string, number> {
  const saved: Record<string, number> = { ...t.fonts };
  for (const key of Object.keys(DEFAULT_FONT_SIZES)) {
    (t.fonts as Record<string, number>)[key] = scalePacketFontSize(
      DEFAULT_FONT_SIZES[key],
    );
  }
  if (!fontSizes) return saved;
  for (const [key, value] of Object.entries(fontSizes)) {
    if (!fontSizeOverrideKeys.has(key)) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
      continue;
    (t.fonts as Record<string, number>)[key] = scalePacketFontSize(value);
  }
  return saved;
}

function wrapAtWidth(textValue: string, width: number, fontSize: number): string[] {
  return wrapPacketText(textValue, Math.max(width, 0), fontSize);
}

function textBoundsHeight(fontSize: number): number {
  return fontSize * (1 + t.textMetrics.descent);
}

export function measurePageHeader(packet: NormalizedPacketDiagram): PageHeaderLayout {
  const textWidth = usableWidth() - 28;
  const titleLines = wrapAtWidth(packet.title, textWidth, t.fonts.title);
  const metaLines = wrapAtWidth(packet.meta ?? "", textWidth, t.fonts.meta);
  const titleHeight = Math.max(
    t.titleHeight,
    t.pageHeader.title.paddingTop +
      packetTextBlockHeight(
        titleLines,
        t.fonts.title,
        t.fonts.title * t.pageHeader.title.lineHeight,
      ) +
      t.pageHeader.title.paddingBottom,
  );
  const titleBox = {
    x: t.marginX,
    y: t.pageHeader.top,
    width: usableWidth(),
    height: titleHeight,
  };
  const metaHeight = Math.max(
    t.metaHeight,
    t.pageHeader.meta.paddingTop +
      packetTextBlockHeight(
        metaLines,
        t.fonts.meta,
        t.fonts.meta * t.pageHeader.meta.lineHeight,
      ) +
      t.pageHeader.meta.paddingBottom,
  );
  const metaBox = {
    x: t.marginX,
    y: titleBox.y + titleBox.height,
    width: usableWidth(),
    height: metaHeight,
  };
  return {
    titleBox,
    titleBaselineY: titleBox.y + t.pageHeader.title.paddingTop + t.fonts.title,
    titleLines,
    metaBox,
    metaBaselineY: metaBox.y + t.pageHeader.meta.paddingTop + t.fonts.meta,
    metaLines,
    bodyStartY: metaBox.y + metaBox.height + t.pageHeader.bodyGap,
  };
}

export function measureFieldTextLayout(
  field: NormalizedPacketField,
  width: number,
): FieldTextLayout {
  const labelWidth = textBoxWidth(width, t.fonts.label, 10);
  const labelLineHeight = t.fonts.label * t.fieldText.labelLineHeight;
  const labelLines = wrapAtWidth(field.label, labelWidth, t.fonts.label);
  const labelBlockHeight = packetTextBlockHeight(
    labelLines,
    t.fonts.label,
    labelLineHeight,
  );
  const sizeTop =
    t.fieldText.paddingTop + labelBlockHeight + t.fieldText.gapAfterLabel;
  const sizeBlockHeight = textBoundsHeight(t.fonts.size);
  const valueLines = field.value
    ? wrapAtWidth(field.value, labelWidth, t.fonts.value)
    : [];
  const valueLineHeight = t.fonts.value * t.fieldText.labelLineHeight;
  const valueBlockHeight = field.value
    ? t.fieldText.gapAfterSize +
      packetTextBlockHeight(valueLines, t.fonts.value, valueLineHeight)
    : 0;
  const valueBaselineOffset = field.value
    ? sizeTop + sizeBlockHeight + t.fieldText.gapAfterSize + t.fonts.value
    : undefined;
  const bottomReserve = field.detail
    ? Math.max(t.fieldText.paddingBottom, t.fieldText.detailBadgeReserve)
    : t.fieldText.paddingBottom;
  return {
    height: Math.max(
      t.wrapFieldRowHeight,
      t.fieldText.paddingTop +
        labelBlockHeight +
        t.fieldText.gapAfterLabel +
        sizeBlockHeight +
        valueBlockHeight +
        bottomReserve,
    ),
    labelBaselineOffset: t.fieldText.paddingTop + t.fonts.label,
    labelLineHeight,
    labelLines,
    sizeBaselineOffset: sizeTop + t.fonts.size,
    valueBaselineOffset,
    valueLines,
  };
}

type FieldBoxInput = {
  readonly range: ByteRange;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly y: number;
  readonly height: number;
};

export function fieldBoxInLine(input: FieldBoxInput): Box {
  const cols = input.lineEnd - input.lineStart + 1;
  const colW = columnWidth(cols);
  const start = Math.max(input.range.start, input.lineStart);
  const end = Math.min(input.range.end, input.lineEnd);
  return {
    x: t.marginX + (start - input.lineStart) * colW,
    y: input.y,
    width: (end - start + 1) * colW,
    height: input.height,
  };
}

export function intersect(
  range: ByteRange,
  lineStart: number,
  lineEnd: number,
): ByteRange | null {
  const start = Math.max(range.start, lineStart);
  const end = Math.min(range.end, lineEnd);
  return start <= end ? { start, end } : null;
}

export function fieldsInLine(
  packet: NormalizedPacketDiagram,
  lineStart: number,
  lineEnd: number,
): NormalizedPacketField[] {
  return packet.fields.filter((field) =>
    intersect(field.range, lineStart, lineEnd),
  );
}

export function detailFieldsInLine(
  packet: NormalizedPacketDiagram,
  lineStart: number,
  lineEnd: number,
): NormalizedPacketField[] {
  return packet.fields.filter(
    (field) =>
      field.detail &&
      field.range.start >= lineStart &&
      field.range.start <= lineEnd,
  );
}

export function formatRange(range: ByteRange): string {
  return range.start === range.end
    ? `B${range.start}`
    : `B${range.start}-${range.end}`;
}

export function rangeSize(range: ByteRange): string {
  return `${range.end - range.start + 1}B`;
}

export function layoutLineGroup(
  packet: NormalizedPacketDiagram,
  lineStart: number,
  lineEnd: number,
  y: number,
  laneSlice?: {
    readonly start: number;
    readonly count: number;
    readonly includeField?: boolean;
  },
): LineGroupLayout {
  const includeField = laneSlice?.includeField !== false;
  const rulerMode = packet.ruler ?? "field";
  const fieldY = y + (includeField ? t.rulerHeight : 0);
  const fieldEntries = fieldsInLine(packet, lineStart, lineEnd).flatMap(
    (field) => {
      const segment = intersect(field.range, lineStart, lineEnd);
      if (!segment) return [];
      const box = fieldBoxInLine({
        range: segment,
        lineStart,
        lineEnd,
        y: fieldY,
        height: t.wrapFieldRowHeight,
      });
      return [
        { field, segment, text: measureFieldTextLayout(field, box.width) },
      ];
    },
  );
  const fieldRowHeight = Math.max(
    t.wrapFieldRowHeight,
    ...fieldEntries.map((entry) => entry.text.height),
  );
  const fields: PlacedFieldLayout[] = includeField
    ? fieldEntries.map((entry) => ({
        field: entry.field,
        box: fieldBoxInLine({
          range: entry.segment,
          lineStart,
          lineEnd,
          y: fieldY,
          height: fieldRowHeight,
        }),
        sourceRange: entry.field.range,
        text: entry.text,
      }))
    : [];

  const details = detailFieldsInLine(packet, lineStart, lineEnd);
  let groupHeight = includeField ? t.rulerHeight + fieldRowHeight : 0;
  let laneCount = 0;
  const connectors: ConnectorLayout[] = [];
  const panels: DetailPanelPlacement[] = [];
  if (details.length > 0) {
    type PanelInfo = {
      field: NormalizedPacketField;
      x: number;
      width: number;
      measure: DetailPanelMeasure;
      source: Point;
    };
    type Lane = { panels: PanelInfo[]; height: number };

    const cols = lineEnd - lineStart + 1;
    const colW = columnWidth(cols);
    const panelInfos: PanelInfo[] = [];

    details.forEach((field) => {
      if (!field.detail) return;
      const range = field.detail.detailRange;
      let detailX = t.marginX + (range.start - lineStart) * colW;
      let detailW = (range.end - range.start + 1) * colW;

      const minCols = minDetailColumns(
        field.detail.bitsView,
        field.detail.bitsColumns,
      );
      const minWidth = minCols * colW;
      if (detailW < minWidth) {
        const expanded = computeAutoDetailRange(
          range.start,
          range.end,
          lineStart,
          lineEnd,
          minCols,
        );
        detailX = t.marginX + (expanded.start - lineStart) * colW;
        detailW = (expanded.end - expanded.start + 1) * colW;
      }

      const rightEdge = detailX + detailW;
      if (rightEdge > t.width) {
        detailX = Math.max(t.marginX, detailX - (rightEdge - t.width));
      }

      const title =
        field.detail.bitsView === "stack"
          ? `${field.label.replace(" + ", " / ")} detail`
          : `${field.label} bit detail`;
      const measure = measureDetailPanel({
        bits: field.detail.bits,
        bitsView: field.detail.bitsView,
        bitsColumns: field.detail.bitsColumns,
        detailWidth: detailW,
        title,
        sourceLabel: formatRange(field.range),
      });
      const sourceBox = fieldBoxInLine({
        range: field.range,
        lineStart,
        lineEnd,
        y: fieldY,
        height: fieldRowHeight,
      });
      panelInfos.push({
        field,
        x: detailX,
        width: detailW,
        measure,
        source: {
          x: sourceBox.x + sourceBox.width / 2,
          y: includeField ? sourceBox.y + sourceBox.height : y,
        },
      });
    });

    panelInfos.sort((a, b) => a.x - b.x);
    const lanes: Lane[] = [];
    const gapX = 8;
    panelInfos.forEach((panel) => {
      let placed = false;
      for (const lane of lanes) {
        const overlaps = lane.panels.some(
          (p) =>
            panel.x < p.x + p.width + gapX &&
            panel.x + panel.width + gapX > p.x,
        );
        if (!overlaps) {
          lane.panels.push(panel);
          lane.height = Math.max(lane.height, panel.measure.height);
          placed = true;
          break;
        }
      }
      if (!placed)
        lanes.push({ panels: [panel], height: panel.measure.height });
    });
    laneCount = lanes.length;

    const selectedLanes =
      laneSlice === undefined
        ? lanes
        : lanes.slice(laneSlice.start, laneSlice.start + laneSlice.count);
    const laneYs: number[] = [];
    const detailsOriginY = includeField
      ? fieldY + fieldRowHeight + t.detailGap
      : y + t.detailGap;
    let cursorY = detailsOriginY;
    selectedLanes.forEach((lane, index) => {
      laneYs[index] = Number(cursorY.toFixed(2));
      cursorY += lane.height + t.detailGap;
    });
    groupHeight += cursorY - (includeField ? fieldY + fieldRowHeight : y);

    selectedLanes.forEach((lane, laneIndex) => {
      const laneY = laneYs[laneIndex];
      lane.panels.forEach((panel) => {
        const target = { x: panel.x + panel.width / 2, y: laneY };
        const midY =
          panel.source.y +
          Math.min(28, Math.max(18, (target.y - panel.source.y) / 2));
        if (panel.field.detail && panel.field.detail.connector !== "none") {
          const connectorPoints: Point[] = [
            panel.source,
            { x: panel.source.x, y: midY },
          ];
          if (laneIndex > 0) {
            const earlierPanels = selectedLanes
              .slice(0, laneIndex)
              .flatMap((earlier) => earlier.panels);
            const left = Math.min(...earlierPanels.map((p) => p.x)) - gapX;
            const right =
              Math.max(...earlierPanels.map((p) => p.x + p.width)) + gapX;
            const distance = (x: number): number =>
              Math.abs(panel.source.x - x) + Math.abs(target.x - x);
            const gutterX = distance(left) <= distance(right) ? left : right;
            const entryY = target.y - t.detailGap / 2;
            connectorPoints.push(
              { x: gutterX, y: midY },
              { x: gutterX, y: entryY },
              { x: target.x, y: entryY },
            );
          } else {
            connectorPoints.push({ x: target.x, y: midY });
          }
          connectorPoints.push(target);
          connectors.push({
            points: connectorPoints,
            kind: panel.field.detail.connector,
          });
        }
        panels.push({
          field: panel.field,
          x: panel.x,
          y: laneY,
          width: panel.width,
          measure: panel.measure,
        });
      });
    });
  }

  return {
    includeField,
    rulerMode,
    lineStart,
    lineEnd,
    y,
    fieldY,
    fields,
    connectors,
    panels,
    height: groupHeight,
    laneCount,
  };
}

function placeLineSlice(
  packet: NormalizedPacketDiagram,
  lineStart: number,
  lineEnd: number,
  y: number,
  laneStart: number,
  count: number,
  includeField: boolean,
): LineGroupLayout {
  return layoutLineGroup(packet, lineStart, lineEnd, y, {
    start: laneStart,
    count,
    includeField,
  });
}

function pageByteRanges(slices: readonly LineGroupLayout[]): ByteRange[] {
  return slices.map((slice) => ({
    start: slice.lineStart,
    end: slice.lineEnd,
  }));
}

export function layoutPacketPages(
  packet: NormalizedPacketDiagram,
  options: PacketSvgRenderOptions = {},
): PacketPageLayout[] {
  const savedFonts = applyPacketSvgFontSizeOverrides(options.fontSizes);
  try {
    return layoutPacketPagesRaw(packet, options);
  } finally {
    restorePacketSvgFontSizes(savedFonts);
  }
}

/** Layout without font save/restore. Caller must apply packet font overrides. */
export function layoutPacketPagesRaw(
  packet: NormalizedPacketDiagram,
  options: PacketSvgRenderOptions,
): PacketPageLayout[] {
  const resolvedWidthMode: "available" | "fixed" = options.widthMode ?? "available";
  const standalone = options.standalone ?? false;
  const paginate = options.paginate ?? true;
  const wrap = typeof packet.wrap === "number" ? packet.wrap : packet.cols;
  const pageBottomPadding = 20;
  const header = measurePageHeader(packet);
  const pageBodyStartY = header.bodyStartY;
  const contentHeightMm = options.contentHeightMm ?? PACKET_A4_BODY_HEIGHT_MM;
  const contentWidthMm = options.contentWidthMm ?? PACKET_A4_BODY_WIDTH_MM;
  const totalHeightUu = contentHeightMm * PACKET_PT_PER_MM * PACKET_PRINT_FONT_SCALE;
  const pageContentBudgetHeight = paginate
    ? Math.max(1, totalHeightUu - pageBodyStartY - pageBottomPadding)
    : Number.POSITIVE_INFINITY;
  const pages: PacketPageLayout[] = [];
  let pageBody: LineGroupLayout[] = [];
  const pageContentBottomY = pageBodyStartY + pageContentBudgetHeight;
  let y = pageBodyStartY;
  let used = y;
  let pageIndex = 1;

  const flushPage = (): void => {
    pages.push({
      header: measurePageHeader(packet),
      slices: pageBody,
      height: used + pageBottomPadding,
      pageIndex,
      byteRanges: pageByteRanges(pageBody),
      widthMode: resolvedWidthMode,
      standalone,
      idPrefix: options.idPrefix ?? "",
      contentWidthMm,
    });
  };

  const commitPlaced = (
    placed: LineGroupLayout,
    lineStart: number,
    lineEnd: number,
    laneStart: number,
    count: number,
    includeField: boolean,
  ): void => {
    let next = placed;
    if (
      paginate &&
      pageBody.length > 0 &&
      used + next.height > pageContentBottomY
    ) {
      flushPage();
      pageIndex += 1;
      pageBody = [];
      y = pageBodyStartY;
      used = y;
      next = placeLineSlice(
        packet,
        lineStart,
        lineEnd,
        y,
        laneStart,
        count,
        includeField,
      );
    }
    pageBody.push(next);
    y += next.height + t.lineGroupGap;
    used = y;
  };

  for (let lineStart = 1; lineStart <= packet.cols; lineStart += wrap) {
    const lineEnd = Math.min(packet.cols, lineStart + wrap - 1);
    const probe = layoutLineGroup(packet, lineStart, lineEnd, y);
    const totalLanes = probe.laneCount;
    if (totalLanes === 0) {
      if (paginate && probe.height > pageContentBudgetHeight) {
        throw new Error(
          `PKT_E306: packet "${packet.title}" line group ${lineStart}-${lineEnd} exceeds a readable page body budget (height ${probe.height} > ${pageContentBudgetHeight}). Reduce wrap columns or detail density.`,
        );
      }
      commitPlaced(probe, lineStart, lineEnd, 0, 0, true);
      continue;
    }

    let laneStart = 0;
    let fieldPlaced = false;
    while (!fieldPlaced || laneStart < totalLanes) {
      const includeField = !fieldPlaced;
      let count = includeField ? totalLanes : totalLanes - laneStart;
      let placed = placeLineSlice(
        packet,
        lineStart,
        lineEnd,
        y,
        includeField ? 0 : laneStart,
        count,
        includeField,
      );
      while (
        paginate &&
        placed.height > pageContentBudgetHeight &&
        count > (includeField ? 0 : 1)
      ) {
        count -= 1;
        placed = placeLineSlice(
          packet,
          lineStart,
          lineEnd,
          y,
          includeField ? 0 : laneStart,
          count,
          includeField,
        );
      }
      if (paginate && placed.height > pageContentBudgetHeight) {
        throw new Error(
          `PKT_E306: packet "${packet.title}" line group ${lineStart}-${lineEnd} exceeds a readable page body budget (height ${placed.height} > ${pageContentBudgetHeight}). Reduce wrap columns or detail density.`,
        );
      }
      commitPlaced(
        placed,
        lineStart,
        lineEnd,
        includeField ? 0 : laneStart,
        count,
        includeField,
      );
      fieldPlaced = true;
      if (!(includeField && count === 0)) {
        laneStart += count;
      }
    }
  }
  flushPage();
  return pages;
}
