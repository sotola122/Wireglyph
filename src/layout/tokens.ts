/** A4 210mm minus @page left/right 15mm. Used to size SVG output and print fonts. */
export const PACKET_A4_BODY_WIDTH_MM = 180;
/** A4 297mm minus @page top/bottom 18mm. */
export const PACKET_A4_BODY_HEIGHT_MM = 261;
export const PACKET_PT_PER_MM = 72 / 25.4;
export const PACKET_PRINT_WIDTH_PT = PACKET_A4_BODY_WIDTH_MM * PACKET_PT_PER_MM;
export const PACKET_PRINT_HEIGHT_PT = PACKET_A4_BODY_HEIGHT_MM * PACKET_PT_PER_MM;
export const PACKET_A4_MIN_LABEL_PT = 8;
/** Layout user width; CSS/print maps this onto PACKET_PRINT_WIDTH_PT. */
export const PACKET_LAYOUT_WIDTH = 1200;
/** Multiply authored/default SVG font sizes so 1 configured point prints as 1pt on A4. */
export const PACKET_PRINT_FONT_SCALE = PACKET_LAYOUT_WIDTH / PACKET_PRINT_WIDTH_PT;

export function packetSvgFontSize(authoredPt: number): number {
  return Number((authoredPt * PACKET_PRINT_FONT_SCALE).toFixed(4));
}

/** Minimum SVG user-unit font size that prints as PACKET_A4_MIN_LABEL_PT on A4. */
export const PACKET_SVG_MIN_EMITTED_FONT_SIZE = packetSvgFontSize(
  PACKET_A4_MIN_LABEL_PT,
);

/** SVG user-unit font size with an 8pt-print floor; configured values stay in user units. */
export function packetSvgEmittedFontSize(authoredSvgUnits: number): number {
  return Number(
    Math.max(authoredSvgUnits, PACKET_SVG_MIN_EMITTED_FONT_SIZE).toFixed(4),
  );
}

export const svgParityTokens = {
  width: PACKET_LAYOUT_WIDTH,
  marginX: 20,
  titleHeight: 42,
  metaHeight: 32,
  rulerHeight: 24,
  fieldRowHeight: 92,
  wrapFieldRowHeight: 82,
  lineGroupGap: 12,
  detailGap: 48,
  detailHeight: 122,
  detailHeaderHeight: 32,
  detailPaddingX: 14,
  detailPanel: {
    headerPaddingTop: 8,
    headerPaddingBottom: 8,
    bodyGap: 14,
    bodyPaddingBottom: 16,
    badge: {
      minHeight: 16,
      paddingY: 3,
    },
    grid: {
      paddingTop: 7,
      paddingBottom: 3,
      lineHeight: 2,
    },
    stack: {
      paddingTop: 9,
      paddingBottom: 8.5,
      valueLineHeight: 1.6,
    },
  },
  borderWidth: 1.2,
  borderStrongWidth: 1.4,
  connectorStrokeWidth: 1.2,
  connectorDotted: "6 6",
  connectorDashed: "10 6",
  fonts: {
    title: 15,
    meta: 10,
    ruler: 8,
    label: 12,
    size: 9,
    value: 9,
    detailTitle: 12,
    detailBody: 8,
    detailStack: 10,
    badge: 8,
  },
  textMetrics: {
    descent: 0.25,
  },
  pageHeader: {
    top: 12,
    bodyGap: 16,
    title: {
      paddingTop: 9,
      paddingBottom: 14.25,
      lineHeight: 1.25,
      maxLines: 1,
    },
    meta: {
      paddingTop: 11,
      paddingBottom: 8.5,
      lineHeight: 1.25,
      maxLines: 1,
    },
  },
  fieldText: {
    paddingTop: 11,
    paddingBottom: 11.75,
    labelLineHeight: 1.4,
    labelMaxLines: 8,
    gapAfterLabel: 11,
    gapAfterSize: 10.75,
    detailBadgeReserve: 24,
  },
  colors: {
    titleBg: "#e8eaef",
    metaBg: "#fafafa",
    fieldBg: "#f4f5f7",
    detailBg: "#ffffff",
    detailHeaderBg: "#eceef2",
    border: "#c5c9d1",
    borderStrong: "#9aa1ad",
    grid: "#d8dbe2",
    text: "#111827",
    muted: "#4b5563",
    accent: "#3f4a5c",
    connector: "#6b7280",
  },
} as const;

export const usableWidth = (): number =>
  svgParityTokens.width - svgParityTokens.marginX * 2;
export const columnWidth = (cols: number): number => usableWidth() / cols;
