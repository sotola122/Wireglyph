// === Source Position ===

/** 1-based DSL line and 0-based column within a packet block */
export interface SourcePosition {
  /** 1-based DSL line number */
  line: number;
  /** 0-based column offset */
  column: number;
  /** Packet block index in the document (0-based) */
  blockIndex: number;
}

// === AST Types ===

/** Root AST node for a single ` ```packet ` DSL block */
export interface PacketDSLAst {
  /** 0-based block index in the document */
  blockIndex: number;
  /** Source position of the block header */
  sourcePosition: SourcePosition;
  /** Diagram title (from `# Title` line) */
  title: string;
  /** Optional metadata string */
  meta?: string;
  /** Number of columns (from `cols:` directive) */
  cols: number;
  /** Byte wrap — number or `'none'` to disable wrapping */
  wrap?: number | "none";
  /** Ruler style: field-level, byte-level, or none */
  ruler?: "field" | "byte" | "none";
  /** Diagram renderer identifier (e.g. `'svg-parity'`) */
  diagramRenderer?: string;
  /** Named presets for styling */
  presets?: Record<string, PacketPreset>;
  /** Field declarations in order */
  fields: PacketFieldAst[];
}

/** A single field declaration in the DSL */
export interface PacketFieldAst {
  /** Source position of this field line */
  sourcePosition: SourcePosition;
  /** Raw range string, e.g. `"B1"`, `"B2-17"` */
  range: string;
  /** Human-readable label */
  label: string;
  /** Optional literal value */
  value?: string;
  /** Named preset key */
  preset: string;
  /** Semantic role */
  role: string;
  /** Bit-level detail view mode */
  bitsView?: "compact" | "detail" | "stack" | "grid" | "none";
  /** Detail panel placement (currently only `'below'`) */
  detailPlacement?: "below";
  /** Byte range covered by the detail panel */
  detailRange?: string;
  /** Connector line style between field and detail panel */
  connector?: "dotted" | "dashed" | "none";
  /** Number of columns in the bit-level grid */
  bitsColumns?: number;
  /** Bit ordering: MSB-first (0) or LSB-first (0) */
  bitOrder?: "msb0" | "lsb0";
  /** Child bit declarations */
  bits?: PacketBitAst[];
}

/** A single bit-level declaration */
export interface PacketBitAst {
  /** Source position of this bit line */
  sourcePosition: SourcePosition;
  /** Raw bit range string, e.g. `"b7"`, `"bit[15-1]"` */
  bitRange: string;
  /** Human-readable label */
  label: string;
  /** Optional literal value */
  value?: string;
  /** Named preset key */
  preset: string;
  /** Semantic role */
  role: string;
}

/** Named style preset */
export interface PacketPreset {
  /** Fill color */
  fill: string;
  /** Stroke color */
  stroke: string;
  /** Text color */
  text: string;
}

// === Parsed Range ===

/** Resolved, 1-based inclusive byte range */
export interface ByteRange {
  /** Start byte (1-based) */
  start: number;
  /** End byte (1-based, inclusive) */
  end: number;
}

// === Normalized Model ===

/** Fully normalized packet diagram after validation and range resolution */
export interface NormalizedPacket {
  /** Original AST */
  ast: PacketDSLAst;
  /** All fields with resolved byte ranges */
  byteRanges: NormalizedField[];
  /** Fields grouped into display lines (by wrap) */
  lineGroups: NormalizedLineGroup[];
  /** Resolved preset map */
  presets: Record<string, PacketPreset>;
}

/** A single field with a resolved byte range */
export interface NormalizedField {
  /** Reference to the source AST field */
  sourceField: PacketFieldAst;
  /** Resolved byte range */
  byteRange: ByteRange;
  /** Number of bytes (end - start + 1) */
  size: number;
  /** Human-readable label */
  label: string;
  /** Optional literal value */
  value?: string;
  /** Named preset key */
  presetName: string;
}

/** A line group (row) in the packet diagram, representing one display line after wrapping */
export interface NormalizedLineGroup {
  /** Display-range string, e.g. `"B1-16"` */
  lineRange: string;
  /** Resolved byte range for the entire group */
  byteRange: ByteRange;
  /** Fields in this line group */
  fields: NormalizedField[];
  /** Detail panels attached to fields in this group */
  details: NormalizedDetail[];
  /** Connector from a field to its detail panel */
  connector?: NormalizedConnector;
}

/** A detail/bit-level panel attached to a field */
export interface NormalizedDetail {
  /** Source field range string */
  sourceRange: string;
  /** Detail panel byte range string */
  detailRange: string;
  /** Fields within this detail panel */
  fields: NormalizedField[];
  /** Bit-level declarations */
  bits: NormalizedBit[];
  /** Visual kind: detail (table), stack (stacked rows), grid (grid layout) */
  kind: "detail" | "stack" | "grid";
}

/** A resolved bit-level entry */
export interface NormalizedBit {
  /** Bit label, e.g. `"b7"`, `"bit[15-1]"` */
  bitLabel: string;
  /** Bit width in bits when the notation defines it */
  width?: number;
  /** Human-readable label */
  label: string;
  /** Optional literal value from the DSL */
  value?: string;
  /** Semantic role */
  role?: string;
  /** Named preset key */
  presetName: string;
}

/** Connector routing between a field and its detail panel */
export interface NormalizedConnector {
  /** Source field range string */
  sourceRange: string;
  /** Line style */
  kind: "dotted" | "dashed";
}

// === Canonical Layout Model ===

/** Axis-aligned bounding box in SVG coordinate space */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A 2D point in SVG coordinate space */
export interface Point {
  x: number;
  y: number;
}

/** Top-level layout for the entire packet diagram (possibly multi-page) */
export interface PacketDiagramLayout {
  /** Total width in SVG units */
  width: number;
  /** Total height in SVG units */
  height: number;
  /** Diagram title text */
  title?: string;
  /** Optional metadata string */
  meta?: string;
  /** Title bar box */
  titleBox: Box;
  /** Optional metadata bar box */
  metaBox?: Box;
  /** Line group (field row) layouts */
  lineGroups: PacketLineGroupLayout[];
  /** Per-page layout breakdown (for multi-page output) */
  pages?: PacketPageLayout[];
}

/** Layout for a single line group (field row) */
export interface PacketLineGroupLayout {
  /** Display range string, e.g. `"B1-16"` */
  lineRange: string;
  /** Outer bounding box for this line group */
  box: Box;
  /** Ruler bar box */
  rulerBox: Box;
  /** Field row box */
  fieldRowBox: Box;
  /** Individual field layouts within this line group */
  fields: PacketFieldLayout[];
  /** Detail panel layouts attached to fields in this line group */
  details: PacketDetailPanelLayout[];
  /** Connector layouts */
  connectors: ConnectorLayout[];
}

/** Layout for a single field */
export interface PacketFieldLayout {
  /** Display range string, e.g. `"B1"`, `"B2-17"` */
  range: string;
  /** Field bounding box */
  box: Box;
  /** Field label text */
  label: string;
  /** Size label text (e.g. `"16B"`, `"1B"`) */
  sizeLabel: string;
  /** Optional literal value text */
  value?: string;
  /** Resolved style tokens */
  style: PacketStyleTokens;
  /** Whether this field has an attached detail panel */
  hasDetail: boolean;
  /** Label text lines after auto-wrap */
  textLines: string[];
}

/** Resolved visual style for a field or cell */
export interface PacketStyleTokens {
  fill: string;
  stroke: string;
  text: string;
}

/** Layout for a detail (bit-level) panel */
export interface PacketDetailPanelLayout {
  /** Source field range string */
  sourceRange: string;
  /** Detail panel byte range string */
  detailRange: string;
  /** Panel title text */
  title: string;
  /** Panel bounding box */
  box: Box;
  /** Panel header box */
  headerBox: Box;
  /** Panel body box */
  bodyBox: Box;
  /** Visual kind */
  kind: "detail" | "stack" | "grid";
  /** Row layouts within the panel */
  rows: PacketDetailRowLayout[];
}

/** A single row in a detail panel */
export interface PacketDetailRowLayout {
  cells: PacketDetailCellLayout[];
}

/** A single cell in a detail panel row */
export interface PacketDetailCellLayout {
  /** Cell bounding box */
  box: Box;
  /** Cell text content */
  text: string;
  /** Cell text lines after auto-wrap */
  textLines: string[];
  /** Resolved style tokens */
  style: PacketStyleTokens;
}

/** Connector line layout between a field and its detail panel */
export interface ConnectorLayout {
  /** Anchor point at the source field */
  sourceAnchor: Point;
  /** Anchor point at the target detail panel */
  targetAnchor: Point;
  /** Intermediate route points for polyline routing */
  route: Point[];
  /** Line style */
  kind: "dotted" | "dashed";
}

/** Per-page layout breakdown */
export interface PacketPageLayout {
  /** 1-based page index */
  pageIndex: number;
  /** ViewBox dimensions for this page */
  box: Box;
  /** Line groups assigned to this page */
  lineGroups: PacketLineGroupLayout[];
}

// === SVG Fragment Types ===

/** A complete SVG fragment ready for injection into HTML/PDF */
export interface SvgFragment {
  /** 1-based page index */
  pageIndex: number;
  /** Total number of pages */
  pageCount: number;
  /** SVG viewBox attribute string (e.g. `"0 0 612 792"`) */
  viewBox: string;
  /** Primitive SVG elements in draw order */
  elements: SvgElement[];
}

/** Union of all supported SVG primitive element types */
export type SvgElement = SvgRect | SvgText | SvgLine | SvgPolyline | SvgCircle;

/** SVG `<rect>` element */
export interface SvgRect {
  tag: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  rx?: number;
}

/** SVG `<text>` element */
export interface SvgText {
  tag: "text";
  x: number;
  y: number;
  content: string;
  fontSize: number;
  fill?: string;
  textAnchor?: "start" | "middle" | "end";
  fontFamily?: string;
}

/** SVG `<line>` element */
export interface SvgLine {
  tag: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
}

/** SVG `<polyline>` element */
export interface SvgPolyline {
  tag: "polyline";
  points: Point[];
  stroke: string;
  strokeWidth: number;
  fill?: string;
  strokeDasharray?: string;
}

/** SVG `<circle>` element */
export interface SvgCircle {
  tag: "circle";
  cx: number;
  cy: number;
  r: number;
  fill?: string;
  stroke?: string;
}

// === Text Wrap Result ===

/** Result of auto-wrap text measurement */
export interface TextWrapResult {
  /** Wrapped text lines */
  lines: string[];
  /** Whether the text was truncated */
  truncated: boolean;
}

// === Diagnostic Types ===

/** A single diagnostic message produced during packet DSL processing */
export interface PacketDslDiagnostic {
  /** Stable diagnostic code (e.g. `PKT_E301`) */
  code: string;
  /** Severity level */
  severity: "error" | "warning";
  /** 0-based block index in the document */
  blockIndex: number;
  /** 1-based line number */
  line: number;
  /** Human-readable message */
  message: string;
  /** Optional source text excerpt */
  sourceExcerpt?: string;
}
