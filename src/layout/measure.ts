import type {
  BitsView,
  DetailPanelMeasure,
  DetailRowLayout,
  NormalizedPacketBit,
} from "../model/packet-diagram.ts";
import { svgParityTokens as t } from "./tokens.ts";
import {
  measureTextWidth,
  packetTextBlockHeight,
  wrapPacketText,
  textBoxWidth,
} from "./text.ts";
import type { PacketFontSizes } from "./theme.ts";

type DetailPanelMeasureInput = {
  readonly bits: readonly NormalizedPacketBit[];
  readonly bitsView: BitsView;
  readonly bitsColumns: number | undefined;
  readonly detailWidth: number;
  readonly title: string;
  readonly sourceLabel: string;
  readonly fonts: PacketFontSizes;
};

function wrapAtWidth(textValue: string, width: number, fontSize: number): string[] {
  return wrapPacketText(textValue, width, fontSize);
}

export function minDetailColumns(
  bitsView: string,
  bitsColumns?: number,
): number {
  switch (bitsView) {
    case "stack":
      return 4;
    case "grid":
      return Math.max(4, Math.ceil((bitsColumns ?? 8) / 2));
    case "detail":
      return Math.max(3, bitsColumns ?? 4);
    default:
      return 3;
  }
}

export function computeAutoDetailRange(
  sourceStart: number,
  sourceEnd: number,
  lineStart: number,
  lineEnd: number,
  minColumns: number,
): { start: number; end: number } {
  let start = sourceStart;
  let end = sourceEnd;

  while (end - start + 1 < minColumns) {
    const canExpandLeft = start > lineStart;
    const canExpandRight = end < lineEnd;

    if (!canExpandLeft && !canExpandRight) break;

    if (canExpandLeft) {
      start--;
    }
    if (end - start + 1 < minColumns && canExpandRight) {
      end++;
    }
  }

  return { start, end };
}

export function measureDetailPanel(
  input: DetailPanelMeasureInput,
): DetailPanelMeasure {
  const { bits, bitsView, bitsColumns, detailWidth, title, sourceLabel, fonts } = input;
  const badgeLabel = `from ${sourceLabel}`;
  const header = measureDetailHeader(detailWidth, title, badgeLabel, fonts);
  const bodyOffsetY = header.headerHeight + t.detailPanel.bodyGap;
  const bodyWidth = Math.max(1, detailWidth - t.detailPaddingX * 2);

  if (bitsView === "stack") {
    const rowLayouts = bits.map((bit) => measureStackBit(bit, bodyWidth, fonts));
    const rowHeights = rowLayouts.map((row) => row.rowHeight);
    const bodyHeight = Math.max(
      rowHeights[0] ?? 0,
      rowHeights.reduce((sum, height) => sum + height, 0),
    );
    const first = rowLayouts[0];
    return {
      width: detailWidth,
      height: bodyOffsetY + bodyHeight + t.detailPanel.bodyPaddingBottom,
      headerHeight: header.headerHeight,
      bodyOffsetY,
      bodyHeight,
      titleBaselineOffset: header.titleBaselineOffset,
      badgeHeight: header.badgeHeight,
      badgeYOffset: header.badgeYOffset,
      rows: bits.length,
      rowHeight: Math.max(0, ...rowHeights),
      rowHeights,
      primaryBaselineOffset: first?.primaryBaselineOffset ?? 0,
      secondaryBaselineOffset: first?.secondaryBaselineOffset,
      valueBaselineOffset: first?.valueBaselineOffset,
      bitsColumns: bitsColumns ?? 4,
      titleLines: header.titleLines,
      badgeLabel,
      headerStacked: header.headerStacked,
      rowLayouts,
    };
  }

  const columns = bitsColumns ?? (bitsView === "grid" ? 8 : 4);
  const cellWidth = bodyWidth / columns;
  const rows = Math.max(1, Math.ceil(bits.length / columns) || 1);
  const rowLayouts: DetailRowLayout[] = [];
  const rowHeights: number[] = [];
  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const rowBits = bits.slice(rowIndex * columns, (rowIndex + 1) * columns);
    const cellLayouts = rowBits.map((bit) => measureGridCell(bit, cellWidth, fonts));
    const rowHeight = Math.max(
      0,
      ...cellLayouts.map((cell) => cell.rowHeight),
    );
    rowHeights.push(rowHeight);
    rowLayouts.push(...cellLayouts);
  }
  const bodyHeight = Math.max(
    rowHeights[0] ?? 0,
    rowHeights.reduce((sum, height) => sum + height, 0),
  );
  const first = rowLayouts[0];
  return {
    width: detailWidth,
    height: bodyOffsetY + bodyHeight + t.detailPanel.bodyPaddingBottom,
    headerHeight: header.headerHeight,
    bodyOffsetY,
    bodyHeight,
    titleBaselineOffset: header.titleBaselineOffset,
    badgeHeight: header.badgeHeight,
    badgeYOffset: header.badgeYOffset,
    rows,
    rowHeight: Math.max(0, ...rowHeights),
    rowHeights,
    primaryBaselineOffset: first?.primaryBaselineOffset ?? 0,
    secondaryBaselineOffset: first?.secondaryBaselineOffset,
    valueBaselineOffset: first?.valueBaselineOffset,
    bitsColumns: columns,
    titleLines: header.titleLines,
    badgeLabel,
    headerStacked: header.headerStacked,
    rowLayouts,
  };
}

function measureDetailHeader(
  detailWidth: number,
  title: string,
  badgeLabel: string,
  fonts: PacketFontSizes,
): {
  readonly headerHeight: number;
  readonly titleBaselineOffset: number;
  readonly badgeHeight: number;
  readonly badgeYOffset: number;
  readonly titleLines: readonly string[];
  readonly headerStacked: boolean;
} {
  const badgeHeight = Math.max(
    t.detailPanel.badge.minHeight,
    t.detailPanel.badge.paddingY * 2 + textBoundsHeight(fonts.badge),
  );
  const badgeWidth = Math.min(
    140,
    Math.max(70, measureTextWidth(badgeLabel, fonts.badge) + 16),
  );
  const sideBySideWidth = 14 + fonts.detailTitle + 10 + badgeWidth + 14;
  const headerStacked = sideBySideWidth > detailWidth;
  const titleWidth = headerStacked
    ? detailWidth - 28
    : detailWidth - badgeWidth - 38;
  const titleLines = wrapAtWidth(title, titleWidth, fonts.detailTitle);
  const titleHeight = packetTextBlockHeight(
    titleLines,
    fonts.detailTitle,
    fonts.detailTitle * 1.25,
  );
  const contentHeight = headerStacked
    ? titleHeight + 6 + badgeHeight
    : Math.max(titleHeight, badgeHeight);
  const headerHeight = Math.max(
    t.detailHeaderHeight,
    t.detailPanel.headerPaddingTop +
      contentHeight +
      t.detailPanel.headerPaddingBottom,
  );
  return {
    headerHeight,
    titleBaselineOffset: t.detailPanel.headerPaddingTop + fonts.detailTitle,
    badgeHeight,
    badgeYOffset: headerStacked
      ? t.detailPanel.headerPaddingTop + titleHeight + 6
      : t.detailPanel.headerPaddingTop + (contentHeight - badgeHeight) / 2,
    titleLines,
    headerStacked,
  };
}

function measureGridCell(
  bit: NormalizedPacketBit,
  cellWidth: number,
  fonts: PacketFontSizes,
): DetailRowLayout {
  const fontSize = fonts.detailBody;
  const textWidth = textBoxWidth(cellWidth, fontSize, 20);
  const rangeLines = wrapAtWidth(bit.range, textWidth, fontSize);
  const labelLines = wrapAtWidth(bit.label, textWidth, fontSize);
  const valueLines = bit.value ? wrapAtWidth(bit.value, textWidth, fontSize) : [];
  const lineHeight = fontSize * t.detailPanel.grid.lineHeight;
  const rangeHeight = packetTextBlockHeight(rangeLines, fontSize, lineHeight);
  const labelHeight = packetTextBlockHeight(labelLines, fontSize, lineHeight);
  const valueHeight = valueLines.length
    ? packetTextBlockHeight(valueLines, fontSize, lineHeight)
    : 0;
  const primaryBaselineOffset = t.detailPanel.grid.paddingTop + fontSize;
  const secondaryBaselineOffset =
    t.detailPanel.grid.paddingTop + rangeHeight + fontSize;
  const valueBaselineOffset = valueLines.length
    ? t.detailPanel.grid.paddingTop + rangeHeight + labelHeight + fontSize
    : undefined;
  return {
    rowHeight:
      t.detailPanel.grid.paddingTop +
      rangeHeight +
      labelHeight +
      valueHeight +
      t.detailPanel.grid.paddingBottom,
    primaryBaselineOffset,
    secondaryBaselineOffset,
    valueBaselineOffset,
    rangeLines,
    labelLines,
    valueLines,
    widthLines: [],
  };
}

function measureStackBit(
  bit: NormalizedPacketBit,
  bodyWidth: number,
  fonts: PacketFontSizes,
): DetailRowLayout {
  const c1 = bodyWidth * 0.28;
  const c2 = bodyWidth * 0.46;
  const labelWidth = textBoxWidth(c2, fonts.detailStack, 24);
  const rangeWidth = textBoxWidth(c1, fonts.detailStack, 20);
  const widthWidth = textBoxWidth(
    bodyWidth - c1 - c2,
    fonts.detailStack,
    22,
  );
  const rangeLines = wrapAtWidth(bit.range, rangeWidth, fonts.detailStack);
  const labelLines = wrapAtWidth(bit.label, labelWidth, fonts.detailStack);
  const widthLines = wrapAtWidth(
    bit.widthLabel ?? "",
    widthWidth,
    fonts.detailStack,
  );
  const valueLines = bit.value
    ? wrapAtWidth(bit.value, labelWidth, fonts.detailBody)
    : [];
  const stackLineHeight = fonts.detailStack * t.detailPanel.stack.valueLineHeight;
  const rangeHeight = packetTextBlockHeight(
    rangeLines,
    fonts.detailStack,
    stackLineHeight,
  );
  const labelHeight = packetTextBlockHeight(
    labelLines,
    fonts.detailStack,
    stackLineHeight,
  );
  const widthHeight = packetTextBlockHeight(
    widthLines,
    fonts.detailStack,
    stackLineHeight,
  );
  const primaryHeight = Math.max(rangeHeight, labelHeight, widthHeight);
  const valueHeight = valueLines.length
    ? packetTextBlockHeight(
        valueLines,
        fonts.detailBody,
        fonts.detailBody * t.detailPanel.stack.valueLineHeight,
      )
    : 0;
  const primaryBaselineOffset =
    t.detailPanel.stack.paddingTop + fonts.detailStack;
  const valueBaselineOffset = valueLines.length
    ? t.detailPanel.stack.paddingTop + primaryHeight + fonts.detailBody
    : undefined;
  return {
    rowHeight:
      t.detailPanel.stack.paddingTop +
      primaryHeight +
      valueHeight +
      t.detailPanel.stack.paddingBottom,
    primaryBaselineOffset,
    secondaryBaselineOffset: undefined,
    valueBaselineOffset,
    rangeLines,
    labelLines,
    valueLines,
    widthLines,
  };
}

export function naturalDetailWidth(
  bits: readonly NormalizedPacketBit[],
  bitsView: BitsView,
  bitsColumns: number | undefined,
  fonts: PacketFontSizes,
): number {
  if (bitsView === "stack") {
    let body = 0;
    for (const bit of bits) {
      const rangeW = measureTextWidth(bit.range, fonts.detailStack) + 20;
      const labelW = measureTextWidth(bit.label, fonts.detailStack) + 24;
      const widthW = measureTextWidth(bit.widthLabel ?? "", fonts.detailStack) + 22;
      const valueW = bit.value
        ? measureTextWidth(bit.value, fonts.detailBody) + 24
        : 0;
      body = Math.max(
        body,
        rangeW / 0.28,
        Math.max(labelW, valueW) / 0.46,
        widthW / 0.26,
      );
    }
    return body + t.detailPaddingX * 2;
  }
  const columns = bitsColumns ?? (bitsView === "grid" ? 8 : 4);
  let cell = 0;
  for (const bit of bits) {
    cell = Math.max(
      cell,
      measureTextWidth(bit.range, fonts.detailBody) + 20,
      measureTextWidth(bit.label, fonts.detailBody) + 20,
      bit.value ? measureTextWidth(bit.value, fonts.detailBody) + 20 : 0,
    );
  }
  return cell * columns + t.detailPaddingX * 2;
}

function textBoundsHeight(fontSize: number): number {
  return fontSize * (1 + t.textMetrics.descent);
}
