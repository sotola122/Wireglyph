import {
  svgParityTokens as t,
  columnWidth,
  usableWidth,
  PACKET_A4_BODY_HEIGHT_MM,
  PACKET_A4_BODY_WIDTH_MM,
  PACKET_PRINT_FONT_SCALE,
  PACKET_PT_PER_MM,
} from "./tokens.ts";
import {
  minDetailColumns,
  computeAutoDetailRange,
  measureDetailPanel,
  naturalDetailWidth,
} from "./measure.ts";
import {
  packetTextBlockHeight,
  wrapPacketText,
  textBoxWidth,
  fitThenWrap,
  measureTextWidth,
} from "./text.ts";
import {
  resolvePacketTheme,
  type PacketColors,
  type PacketFontSizes,
  type ResolvedPacketTheme,
} from "./theme.ts";
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
  minFontPt?: number;
  /** Per-call colour overrides; see `PacketThemeOptions.colors`. */
  colors?: Partial<PacketColors>;
  theme?: ResolvedPacketTheme;
};

export type FieldTextLayout = {
  readonly height: number;
  readonly labelBaselineOffset: number;
  readonly labelLineHeight: number;
  readonly labelFontSize: number;
  readonly labelLines: readonly string[];
  /** True when the label was moved to a callout under the row. */
  readonly externalLabel: boolean;
  /** Undefined when the cell is too narrow for its own size caption. */
  readonly sizeBaselineOffset: number | undefined;
  readonly valueBaselineOffset: number | undefined;
  readonly valueFontSize: number;
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
  readonly kind: "solid" | "dotted" | "dashed";
};

export type DetailPanelPlacement = {
  readonly field: NormalizedPacketField;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly measure: DetailPanelMeasure;
};

/**
 * Full field name for a cell too narrow to hold it, placed under the field row
 * with a leader back to the cell so the bit range stays identifiable.
 */
export type FieldCalloutLayout = {
  readonly field: NormalizedPacketField;
  readonly text: string;
  readonly fontSize: number;
  /** Text centre x. */
  readonly x: number;
  readonly baselineY: number;
  /** Leader polyline from the cell bottom edge to the text top. */
  readonly leader: readonly Point[];
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
  readonly callouts: readonly FieldCalloutLayout[];
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
  readonly fonts: PacketFontSizes;
  readonly fontFamily: string;
  readonly colors: PacketColors;
};

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

function wrapAtWidth(textValue: string, width: number, fontSize: number): string[] {
  return wrapPacketText(textValue, Math.max(width, 0), fontSize);
}

function textBoundsHeight(fontSize: number): number {
  return fontSize * (1 + t.textMetrics.descent);
}

export function measurePageHeader(
  packet: NormalizedPacketDiagram,
  fonts: PacketFontSizes,
): PageHeaderLayout {
  const textWidth = usableWidth() - 28;
  const titleLines = wrapAtWidth(packet.title, textWidth, fonts.title);
  const metaLines = wrapAtWidth(packet.meta ?? "", textWidth, fonts.meta);
  const titleHeight = Math.max(
    t.titleHeight,
    t.pageHeader.title.paddingTop +
      packetTextBlockHeight(
        titleLines,
        fonts.title,
        fonts.title * t.pageHeader.title.lineHeight,
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
        fonts.meta,
        fonts.meta * t.pageHeader.meta.lineHeight,
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
    titleBaselineY: titleBox.y + t.pageHeader.title.paddingTop + fonts.title,
    titleLines,
    metaBox,
    metaBaselineY: metaBox.y + t.pageHeader.meta.paddingTop + fonts.meta,
    metaLines,
    bodyStartY: metaBox.y + metaBox.height + t.pageHeader.bodyGap,
  };
}

export function measureFieldTextLayout(
  field: NormalizedPacketField,
  width: number,
  fonts: PacketFontSizes,
  minFontFloor = fonts.label,
  sizeLabel = field.sizeLabel ?? "",
): FieldTextLayout {
  const labelWidth = textBoxWidth(width, fonts.label, 10);
  // A label that would need wrapping at the smallest readable size still stays
  // in the cell when the cell is wide enough to show a usable fragment. Below
  // roughly four characters per line the wrapped label stops being readable
  // (`RXNEIE` becomes `RX`/`NE`/`IE`), so the full name moves to a callout
  // under the row, with a leader back to the bit range.
  const floorCharsPerLine = labelWidth / Math.max(1e-6, minFontFloor * 0.62);
  const externalLabel =
    field.label.trim().length > 0 &&
    measureTextWidth(field.label, minFontFloor) > labelWidth &&
    floorCharsPerLine < 4;
  const fittedLabel = fitThenWrap(
    field.label,
    labelWidth,
    fonts.label,
    minFontFloor,
  );
  const labelFontSize = externalLabel ? minFontFloor : fittedLabel.fontSize;
  const labelLineHeight = labelFontSize * t.fieldText.labelLineHeight;
  const labelLines = externalLabel ? [] : fittedLabel.lines;
  const labelBlockHeight = externalLabel
    ? 0
    : packetTextBlockHeight(labelLines, labelFontSize, labelLineHeight);
  const sizeTop =
    t.fieldText.paddingTop + labelBlockHeight + t.fieldText.gapAfterLabel;
  // A cell narrower than its own size caption would spill the caption into the
  // neighbouring cell; the ruler already states the width, so drop it instead.
  const showSize =
    sizeLabel.length > 0 &&
    measureTextWidth(sizeLabel, fonts.size) <= textBoxWidth(width, fonts.size, 10);
  const sizeBlockHeight = showSize ? textBoundsHeight(fonts.size) : 0;
  const valueWidth = textBoxWidth(width, fonts.value, 10);
  const valueLines = field.value
    ? wrapAtWidth(field.value, valueWidth, fonts.value)
    : [];
  const valueLineHeight = fonts.value * t.fieldText.labelLineHeight;
  const valueBlockHeight = field.value
    ? t.fieldText.gapAfterSize +
      packetTextBlockHeight(valueLines, fonts.value, valueLineHeight)
    : 0;
  const valueBaselineOffset = field.value
    ? sizeTop + sizeBlockHeight + t.fieldText.gapAfterSize + fonts.value
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
    labelBaselineOffset: t.fieldText.paddingTop + labelFontSize,
    labelLineHeight,
    labelFontSize,
    labelLines,
    externalLabel,
    sizeBaselineOffset: showSize ? sizeTop + fonts.size : undefined,
    valueBaselineOffset,
    valueFontSize: fonts.value,
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
  fonts: PacketFontSizes = resolvePacketTheme().fonts,
  minFontFloor = fonts.label,
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
        {
          field,
          segment,
          text: measureFieldTextLayout(
            field,
            box.width,
            fonts,
            minFontFloor,
            field.sizeLabel ?? rangeSize(segment),
          ),
        },
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
  const callouts = includeField
    ? layoutFieldCallouts(fields, fieldY + fieldRowHeight, fonts, groupHeight)
    : { callouts: [] as FieldCalloutLayout[], height: groupHeight };
  groupHeight = callouts.height;
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

      const naturalW = naturalDetailWidth(
        field.detail.bits,
        field.detail.bitsView,
        field.detail.bitsColumns,
        fonts,
      );
      detailW = Math.max(detailW, naturalW);
      if (detailX + detailW > t.width) {
        detailW = Math.max(1, t.width - detailX);
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
        fonts,
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
            kind:
              panel.field.detail.connector === "dotted" ||
              panel.field.detail.connector === "dashed"
                ? panel.field.detail.connector
                : "solid",
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
    callouts: callouts.callouts,
    height: groupHeight,
    laneCount,
  };
}

const CALLOUT_TEXT_GAP = 18;
const CALLOUT_ROW_GAP = 8;
const CALLOUT_LEADER_GAP = 28;

/**
 * Pack the external labels of a line group into rows under the field row and
 * give each one a leader back to its cell. Every callout keeps the complete
 * field name; only cells that cannot show it participate.
 */
function layoutFieldCallouts(
  fields: readonly PlacedFieldLayout[],
  rowBottom: number,
  fonts: PacketFontSizes,
  baseHeight: number,
): { callouts: FieldCalloutLayout[]; height: number } {
  const entries = fields
    .filter((entry) => entry.text.externalLabel)
    .sort((a, b) => a.box.x - b.box.x);
  if (entries.length === 0) return { callouts: [], height: baseHeight };

  const fontSize = fonts.size;
  const rowHeight = fontSize * 1.25 + CALLOUT_ROW_GAP;
  const left = t.marginX;
  const right = t.marginX + usableWidth();
  const callouts: FieldCalloutLayout[] = [];
  let x: number = left;
  let row = 0;
  let freshRow = true;
  entries.forEach((entry, index) => {
    const textWidth = measureTextWidth(entry.field.label, fontSize);
    const boxWidth = Math.min(textWidth, right - left);
    const targetX = entry.box.x + entry.box.width / 2;
    const clampLeft = (value: number): number =>
      Math.min(Math.max(value, left), right - boxWidth);
    // Start each row under the cell it belongs to; keep leaders short.
    if (freshRow) {
      x = clampLeft(targetX - boxWidth / 2);
      freshRow = false;
    } else if (x + boxWidth > right) {
      row += 1;
      x = clampLeft(targetX - boxWidth / 2);
    }
    const centreX = x + boxWidth / 2;
    const baselineY = rowBottom + CALLOUT_LEADER_GAP + row * rowHeight + fontSize;
    const textTop = baselineY - fontSize;
    // Stagger the elbow so neighbouring leaders stay visually separate.
    const elbowY = rowBottom + 6 + (index % 4) * 6;
    callouts.push({
      field: entry.field,
      text: entry.field.label,
      fontSize,
      x: centreX,
      baselineY,
      leader: [
        { x: targetX, y: rowBottom },
        { x: targetX, y: elbowY },
        { x: centreX, y: elbowY },
        { x: centreX, y: textTop },
      ],
    });
    x += boxWidth + CALLOUT_TEXT_GAP;
  });
  return {
    callouts,
    height: baseHeight + CALLOUT_LEADER_GAP + (row + 1) * rowHeight,
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
  fonts: PacketFontSizes,
  minFontFloor: number,
): LineGroupLayout {
  return layoutLineGroup(
    packet,
    lineStart,
    lineEnd,
    y,
    {
      start: laneStart,
      count,
      includeField,
    },
    fonts,
    minFontFloor,
  );
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
  return layoutPacketPagesRaw(packet, {
    ...options,
    theme: options.theme ?? resolvePacketTheme(options),
  });
}

/** Layout using a resolved per-call theme (no global font mutation). */
export function layoutPacketPagesRaw(
  packet: NormalizedPacketDiagram,
  options: PacketSvgRenderOptions,
): PacketPageLayout[] {
  const theme = options.theme ?? resolvePacketTheme(options);
  const fonts = theme.fonts;
  const minFontFloor = theme.minFontFloor;
  const resolvedWidthMode: "available" | "fixed" = options.widthMode ?? "available";
  const standalone = options.standalone ?? false;
  const paginate = options.paginate ?? true;
  const wrap = typeof packet.wrap === "number" ? packet.wrap : packet.cols;
  const pageBottomPadding = 20;
  const header = measurePageHeader(packet, fonts);
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
      header: measurePageHeader(packet, fonts),
      slices: pageBody,
      height: used + pageBottomPadding,
      pageIndex,
      byteRanges: pageByteRanges(pageBody),
      widthMode: resolvedWidthMode,
      standalone,
      idPrefix: options.idPrefix ?? "",
      contentWidthMm,
      fonts,
      fontFamily: theme.fontFamily,
      colors: theme.colors,
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
        fonts,
        minFontFloor,
      );
    }
    pageBody.push(next);
    y += next.height + t.lineGroupGap;
    used = y;
  };

  for (let lineStart = 1; lineStart <= packet.cols; lineStart += wrap) {
    const lineEnd = Math.min(packet.cols, lineStart + wrap - 1);
    const probe = layoutLineGroup(
      packet,
      lineStart,
      lineEnd,
      y,
      undefined,
      fonts,
      minFontFloor,
    );
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
        fonts,
        minFontFloor,
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
          fonts,
          minFontFloor,
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
