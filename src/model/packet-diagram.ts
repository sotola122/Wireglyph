export type ConnectorKind = "solid" | "dotted" | "dashed" | "none";
export type BitsView = "compact" | "detail" | "stack" | "grid" | "none";
export type PresetName =
  | "accent"
  | "data"
  | "muted"
  | "fixed"
  | "note"
  | "warn"
  | "error"
  | "blank";

export interface ByteRange {
  start: number;
  end: number;
}
export interface Point {
  x: number;
  y: number;
}
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NormalizedPacketDiagram {
  title: string;
  meta?: string;
  cols: number;
  wrap?: number | "none";
  ruler?: "field" | "byte" | "none";
  diagramRenderer?: "svg-parity";
  fields: NormalizedPacketField[];
}

export interface NormalizedPacketField {
  range: ByteRange;
  label: string;
  value?: string;
  /** Display size (memory map KiB/MiB, register bits). Packet DSL omits this and uses `NB`. */
  sizeLabel?: string;
  preset: PresetName;
  role: string;
  detail?: NormalizedPacketDetail;
}

export interface NormalizedPacketDetail {
  bitsView: BitsView;
  detailRange: ByteRange;
  connector: ConnectorKind;
  bits: NormalizedPacketBit[];
  bitsColumns?: number;
  bitOrder?: "msb0" | "lsb0";
}

export interface NormalizedPacketBit {
  range: string;
  label: string;
  value?: string;
  widthLabel?: string;
  preset: PresetName;
  role: string;
}

export interface DetailRowLayout {
  readonly rowHeight: number;
  readonly primaryBaselineOffset: number;
  readonly secondaryBaselineOffset: number | undefined;
  readonly valueBaselineOffset: number | undefined;
  readonly rangeLines: readonly string[];
  readonly labelLines: readonly string[];
  readonly valueLines: readonly string[];
  readonly widthLines: readonly string[];
}

export interface DetailPanelMeasure {
  width: number;
  height: number;
  headerHeight: number;
  bodyOffsetY: number;
  bodyHeight: number;
  titleBaselineOffset: number;
  badgeHeight: number;
  badgeYOffset: number;
  rows: number;
  rowHeight: number;
  rowHeights: readonly number[];
  primaryBaselineOffset: number;
  secondaryBaselineOffset: number | undefined;
  valueBaselineOffset: number | undefined;
  bitsColumns: number;
  titleLines: readonly string[];
  badgeLabel: string;
  headerStacked: boolean;
  rowLayouts: readonly DetailRowLayout[];
}

export interface RenderedSvgPage {
  svg: string;
  pageIndex: number;
  title: string;
  width: number;
  height: number;
  byteRanges: readonly ByteRange[];
}
