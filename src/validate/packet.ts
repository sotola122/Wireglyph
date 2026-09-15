// validator.ts — Packet DSL semantic validator
//
// Takes a parsed PacketDSLAst and validates semantic completeness,
// returning aggregated diagnostics. Invalid packets must produce
// build-failing errors.

import type {
  PacketDSLAst,
  PacketFieldAst,
  PacketDslDiagnostic,
} from "../ast/packet.ts";
import { makeError, makeWarning, DiagnosticCodes } from "../diagnostics.ts";

// === Config ===

/** Config for validatePacketAst — reserved for future use */
export type ValidateConfig = Record<string, never>;

// === Exported Entry-Point ===

/**
 * Validate a parsed Packet DSL AST for semantic completeness.
 *
 * Returns an array of diagnostics (errors + warnings). An empty array
 * means the AST is valid.
 */
export function validatePacketAst(
  ast: PacketDSLAst,
  _config?: ValidateConfig,
): PacketDslDiagnostic[] {
  const diagnostics: PacketDslDiagnostic[] = [];
  const blockIndex = ast.blockIndex;

  // ── 1. Required keys ────────────────────────────────────────────────

  if (!ast.title || ast.title.trim() === "") {
    diagnostics.push(
      makeError(
        DiagnosticCodes.MISSING_REQUIRED_KEY,
        blockIndex,
        ast.sourcePosition.line,
        "Packet title must not be empty",
      ),
    );
  }

  if (!ast.cols || ast.cols <= 0) {
    diagnostics.push(
      makeError(
        DiagnosticCodes.MISSING_REQUIRED_KEY,
        blockIndex,
        ast.sourcePosition.line,
        "cols must be a positive integer (> 0)",
      ),
    );
  }

  if (!ast.fields || ast.fields.length === 0) {
    diagnostics.push(
      makeError(
        DiagnosticCodes.MISSING_REQUIRED_KEY,
        blockIndex,
        ast.sourcePosition.line,
        "At least one field must be defined",
      ),
    );
  }

  // If cols is invalid, skip range-dependent checks
  const cols = ast.cols > 0 ? ast.cols : 0;

  // ── 2. Diagram renderer ─────────────────────────────────────────────

  if (
    ast.diagramRenderer !== undefined &&
    ast.diagramRenderer !== "svg-parity"
  ) {
    diagnostics.push(
      makeError(
        DiagnosticCodes.INVALID_RENDERER,
        blockIndex,
        ast.sourcePosition.line,
        `Invalid diagram renderer "${ast.diagramRenderer}" — must be "svg-parity" or omitted`,
        `diagramRenderer: ${ast.diagramRenderer}`,
      ),
    );
  }

  // ── 3. Wrap validation ──────────────────────────────────────────────

  if (ast.wrap !== undefined && ast.wrap !== "none") {
    if (typeof ast.wrap !== "number" || ![8, 16, 32].includes(ast.wrap)) {
      diagnostics.push(
        makeError(
          DiagnosticCodes.INVALID_BYTE_RANGE,
          blockIndex,
          ast.sourcePosition.line,
          `Invalid wrap value "${ast.wrap}" — must be 8, 16, 32, or "none"`,
        ),
      );
    }
  }

  // ── 4. Ruler validation ─────────────────────────────────────────────

  if (
    ast.ruler !== undefined &&
    ast.ruler !== "field" &&
    ast.ruler !== "byte" &&
    ast.ruler !== "none"
  ) {
    diagnostics.push(
      makeError(
        DiagnosticCodes.INVALID_BYTE_RANGE,
        blockIndex,
        ast.sourcePosition.line,
        `Invalid ruler value "${ast.ruler}" — must be "field", "byte", or "none"`,
      ),
    );
  }

  // ── 5–7. Field byte range checks ────────────────────────────────────
  // Only run field-level checks when we have valid cols and at least one field

  const parsedFields = parseAllFieldRanges(
    ast.fields,
    blockIndex,
    cols,
    diagnostics,
  );
  const parsedRanges = parsedFields.filter((pf) => pf.range !== null) as {
    field: PacketFieldAst;
    range: { start: number; end: number };
    detailRange: { start: number; end: number } | null;
  }[];

  if (cols > 0 && parsedFields.length > 0) {
    // ── 5. Byte range overlap (PKT_E303) ──────────────────────────────
    checkRangeOverlap(parsedRanges, blockIndex, diagnostics);

    // ── 6. Byte range gap (PKT_E304) ──────────────────────────────────
    checkRangeGap(parsedRanges, cols, blockIndex, diagnostics);

    // ── 13. detailRange cross-boundary (PKT_E305) ─────────────────────
    checkDetailRangeCrossBoundary(
      parsedRanges,
      ast.wrap,
      blockIndex,
      diagnostics,
    );
  }

  // ── 8. Custom presets warning (PKT_W205) ─────────────────────────────

  if (ast.presets !== undefined && ast.presets !== null) {
    diagnostics.push(
      makeWarning(
        "PKT_W205",
        blockIndex,
        ast.sourcePosition.line,
        "Custom presets are not supported in this version — definitions will be ignored",
      ),
    );
  }

  // ── 9. Preset validation (PKT_W202) ─────────────────────────────────

  const standardPresets = new Set([
    "accent",
    "data",
    "muted",
    "fixed",
    "note",
    "warn",
    "error",
    "blank",
  ]);
  const hasCustomPresets =
    ast.presets !== undefined && Object.keys(ast.presets).length > 0;

  for (const field of ast.fields) {
    if (
      field.preset &&
      !standardPresets.has(field.preset) &&
      !hasCustomPresets
    ) {
      diagnostics.push(
        makeWarning(
          "PKT_W202",
          blockIndex,
          field.sourcePosition.line,
          `Referenced preset "${field.preset}" is not a standard preset — custom presets may be defined`,
        ),
      );
    }
  }

  // ── 10. Role validation (PKT_E310) ─────────────────────────────────

  const ROLE_REGEX = /^[A-Za-z0-9]{1,16}$/;

  for (const field of ast.fields) {
    if (!ROLE_REGEX.test(field.role)) {
      diagnostics.push(
        makeError(
          DiagnosticCodes.INVALID_ROLE,
          blockIndex,
          field.sourcePosition.line,
          `Invalid role "${field.role}" — must match ^[A-Za-z0-9]{1,16}$`,
        ),
      );
    }

    // Also validate bit roles
    if (field.bits) {
      for (const bit of field.bits) {
        if (!ROLE_REGEX.test(bit.role)) {
          diagnostics.push(
            makeError(
              DiagnosticCodes.INVALID_ROLE,
              blockIndex,
              bit.sourcePosition.line,
              `Invalid role "${bit.role}" — must match ^[A-Za-z0-9]{1,16}$`,
            ),
          );
        }
      }
    }
  }

  // ── 11. Bit range validation (PKT_E314–E317) ─────────────────────────

  for (const field of ast.fields) {
    validateFieldBitRanges(
      field,
      diagnostics,
      blockIndex,
      field.sourcePosition.line,
    );
  }

  // ── 12. bitsView validation (PKT_E311) ──────────────────────────────

  const VALID_BITS_VIEWS = new Set([
    "compact",
    "detail",
    "stack",
    "grid",
    "none",
  ]);

  for (const field of ast.fields) {
    if (field.bitsView !== undefined && !VALID_BITS_VIEWS.has(field.bitsView)) {
      diagnostics.push(
        makeError(
          DiagnosticCodes.INVALID_BITS_VIEW,
          blockIndex,
          field.sourcePosition.line,
          `Invalid bitsView "${field.bitsView}" — must be one of: compact, detail, stack, grid, none`,
        ),
      );
    }
  }

  // ── 12. Connector validation (PKT_E312) ─────────────────────────────

  const VALID_CONNECTORS = new Set(["solid", "dotted", "dashed", "none"]);

  for (const field of ast.fields) {
    if (
      field.connector !== undefined &&
      !VALID_CONNECTORS.has(field.connector)
    ) {
      diagnostics.push(
        makeError(
          DiagnosticCodes.INVALID_CONNECTOR,
          blockIndex,
          field.sourcePosition.line,
          `Invalid connector "${field.connector}" — must be one of: solid, dotted, dashed, none`,
        ),
      );
    }
  }

  // ── 13. detailPlacement validation ──────────────────────────────────

  for (const field of ast.fields) {
    if (
      field.detailPlacement !== undefined &&
      field.detailPlacement !== "below"
    ) {
      diagnostics.push(
        makeError(
          DiagnosticCodes.INVALID_DETAIL_RANGE,
          blockIndex,
          field.sourcePosition.line,
          `Invalid detailPlacement "${field.detailPlacement}" — must be "below"`,
        ),
      );
    }
  }

  // ── 15. Oversized line group (PKT_E306) ─────────────────────────────

  if (ast.wrap === "none" && cols > 64) {
    diagnostics.push(
      makeWarning(
        DiagnosticCodes.OVERSIZED_LINE_GROUP,
        blockIndex,
        ast.sourcePosition.line,
        `Line group with ${cols} columns may be oversized — consider setting wrap: 8, 16, or 32`,
      ),
    );
  }

  return diagnostics;
}

// === Internal Helpers ===

/** Parsed field range result */
interface ParsedFieldRange {
  field: PacketFieldAst;
  range: { start: number; end: number } | null;
  detailRange: { start: number; end: number } | null;
}

/**
 * Parse all field byte ranges and emit diagnostics for invalid syntax.
 * Returns parsed ranges (null range means syntax was invalid).
 */
function parseAllFieldRanges(
  fields: PacketFieldAst[],
  blockIndex: number,
  cols: number,
  diagnostics: PacketDslDiagnostic[],
): ParsedFieldRange[] {
  const result: ParsedFieldRange[] = [];

  for (const field of fields) {
    const parsed = parseByteRange(field.range);
    let parsedRange: { start: number; end: number } | null = null;

    if (!parsed) {
      diagnostics.push(
        makeError(
          DiagnosticCodes.INVALID_BYTE_RANGE,
          blockIndex,
          field.sourcePosition.line,
          `Invalid byte range "${field.range}" — must match pattern B<num> or B<start>-<end>`,
        ),
      );
    } else if (parsed.end < parsed.start) {
      diagnostics.push(
        makeError(
          DiagnosticCodes.INVALID_BYTE_RANGE,
          blockIndex,
          field.sourcePosition.line,
          `Invalid byte range "${field.range}" — end byte (${parsed.end}) must be >= start byte (${parsed.start})`,
        ),
      );
    } else if (parsed.start < 1 || parsed.end > cols) {
      diagnostics.push(
        makeError(
          DiagnosticCodes.INVALID_BYTE_RANGE,
          blockIndex,
          field.sourcePosition.line,
          `Byte range "${field.range}" is outside 1..${cols}`,
        ),
      );
    } else {
      parsedRange = parsed;
    }

    // Parse detailRange if present
    let parsedDetailRange: { start: number; end: number } | null = null;
    if (field.detailRange) {
      const detailParsed = parseByteRange(field.detailRange);

      if (!detailParsed) {
        diagnostics.push(
          makeError(
            DiagnosticCodes.INVALID_DETAIL_RANGE,
            blockIndex,
            field.sourcePosition.line,
            `Invalid detailRange "${field.detailRange}" — must match pattern B<num> or B<start>-<end>`,
          ),
        );
      } else if (detailParsed.end < detailParsed.start) {
        diagnostics.push(
          makeError(
            DiagnosticCodes.INVALID_DETAIL_RANGE,
            blockIndex,
            field.sourcePosition.line,
            `Invalid detailRange "${field.detailRange}" — end byte (${detailParsed.end}) must be >= start byte (${detailParsed.start})`,
          ),
        );
      } else if (detailParsed.start < 1 || detailParsed.end > cols) {
        diagnostics.push(
          makeError(
            DiagnosticCodes.INVALID_DETAIL_RANGE,
            blockIndex,
            field.sourcePosition.line,
            `detailRange "${field.detailRange}" is outside 1..${cols}`,
          ),
        );
      } else {
        parsedDetailRange = detailParsed;
      }
    }

    result.push({
      field,
      range: parsedRange,
      detailRange: parsedDetailRange,
    });
  }

  return result;
}

/**
 * Parse a byte range string like "B1", "B2-17", "Byte1", "Byte2-17".
 * Returns { start, end } or null if the string is invalid.
 */
function parseByteRange(range: string): { start: number; end: number } | null {
  const match = range.match(/^(?:B|Byte)(\d+)(?:-(\d+))?$/i);
  if (!match) return null;
  const start = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : start;
  return { start, end };
}

/**
 * Check for overlapping byte ranges between fields (PKT_E303).
 * Only checks main field ranges. detailRange is a visual width hint,
 * not a field declaration, and is free to overlap with other fields.
 */
function checkRangeOverlap(
  parsedFields: {
    field: PacketFieldAst;
    range: { start: number; end: number };
    detailRange: { start: number; end: number } | null;
  }[],
  blockIndex: number,
  diagnostics: PacketDslDiagnostic[],
): void {
  // Only check main field ranges — detailRange is a visual width hint
  const allRanges: {
    field: PacketFieldAst;
    range: { start: number; end: number };
    kind: string;
  }[] = [];

  for (const pf of parsedFields) {
    allRanges.push({
      field: pf.field,
      range: pf.range,
      kind: "field",
    });
    // detailRange is NOT added — it is a visual hint, not a field declaration
  }

  // Check every pair for overlap
  for (let i = 0; i < allRanges.length; i++) {
    for (let j = i + 1; j < allRanges.length; j++) {
      const a = allRanges[i];
      const b = allRanges[j];
      if (rangesOverlap(a.range, b.range)) {
        diagnostics.push(
          makeError(
            DiagnosticCodes.RANGE_OVERLAP,
            blockIndex,
            a.field.sourcePosition.line,
            `Byte range ${formatRange(a.range)} (${a.kind}) overlaps with ${formatRange(b.range)} (${b.kind}) at line ${b.field.sourcePosition.line}`,
          ),
        );
      }
    }
  }
}

/** Check if two byte ranges overlap */
function rangesOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start <= b.end && b.start <= a.end;
}

/** Format a byte range for error messages */
function formatRange(r: { start: number; end: number }): string {
  return r.start === r.end ? `B${r.start}` : `B${r.start}-${r.end}`;
}

/**
 * Check for gaps in field byte ranges (PKT_E304).
 * Fields must cover a contiguous range from B1 to B{cols}.
 * Only checks main fields (not detailRanges).
 */
function checkRangeGap(
  parsedFields: {
    field: PacketFieldAst;
    range: { start: number; end: number };
  }[],
  cols: number,
  blockIndex: number,
  diagnostics: PacketDslDiagnostic[],
): void {
  if (parsedFields.length === 0) return;

  // Sort by start byte
  const sorted = [...parsedFields].sort(
    (a, b) => a.range.start - b.range.start,
  );

  // Check from B1
  if (sorted[0].range.start !== 1) {
    diagnostics.push(
      makeError(
        DiagnosticCodes.RANGE_GAP,
        blockIndex,
        sorted[0].field.sourcePosition.line,
        `Byte range gap: first field starts at ${formatRange(sorted[0].range)} but should start at B1`,
      ),
    );
    return; // Can't meaningfully check further gaps
  }

  let expectedNext = sorted[0].range.end + 1;

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    if (current.range.start > expectedNext) {
      diagnostics.push(
        makeError(
          DiagnosticCodes.RANGE_GAP,
          blockIndex,
          current.field.sourcePosition.line,
          `Byte range gap: expected B${expectedNext} but found ${formatRange(current.range)}`,
        ),
      );
      // Don't return — continue checking for more gaps
    }
    expectedNext = Math.max(expectedNext, current.range.end + 1);
  }

  // Check coverage up to cols
  if (expectedNext <= cols) {
    diagnostics.push(
      makeError(
        DiagnosticCodes.RANGE_GAP,
        blockIndex,
        parsedFields[parsedFields.length - 1].field.sourcePosition.line,
        `Byte range gap: fields cover up to B${expectedNext - 1} but cols=${cols}`,
      ),
    );
  }
}

/**
 * Check that detailRange does not cross a wrap boundary (PKT_E305).
 *
 * With wrap: N, line groups are:
 *   B1-N, B(N+1)-2N, B(2N+1)-3N, ...
 *
 * A detailRange must be contained within a single line group.
 */
function checkDetailRangeCrossBoundary(
  parsedFields: {
    field: PacketFieldAst;
    range: { start: number; end: number };
    detailRange: { start: number; end: number } | null;
  }[],
  wrap: number | "none" | undefined,
  blockIndex: number,
  diagnostics: PacketDslDiagnostic[],
): void {
  if (wrap === "none" || wrap === undefined) return; // No wrap boundary to cross

  for (const pf of parsedFields) {
    const hasDetail =
      Boolean(pf.field.bits?.length) && pf.field.bitsView !== "none";
    if (!pf.detailRange && !hasDetail) continue;
    const effective = pf.detailRange ?? pf.range;
    const detailStart = effective.start;
    const detailEnd = effective.end;

    // Calculate which line groups the detail range spans
    const startGroup = Math.ceil(detailStart / wrap);
    const endGroup = Math.ceil(detailEnd / wrap);

    if (startGroup !== endGroup) {
      diagnostics.push(
        makeError(
          DiagnosticCodes.INVALID_DETAIL_RANGE,
          blockIndex,
          pf.field.sourcePosition.line,
          `detailRange ${formatRange(effective)} crosses wrap:${wrap} boundary (line-group ${startGroup} to ${endGroup})`,
        ),
      );
    }
  }
}

// === Bit Range Parsing ===

/**
 * Parse a bit range string into its components.
 * Handles patterns: b7, b0-b3, bit[15-1], bit[0], B15.b7-B16.b1, B1.b5
 * Returns null if the string cannot be parsed.
 */
function parseBitRangeString(range: string): {
  byteStart?: number;
  byteEnd?: number;
  bitStart: number;
  bitEnd: number;
} | null {
  // Cross-byte range: B15.b7-B16.b1
  const crossByteMatch = range.match(/^B(\d+)\.b(\d+)-B(\d+)\.b(\d+)$/);
  if (crossByteMatch) {
    return {
      byteStart: parseInt(crossByteMatch[1], 10),
      bitStart: parseInt(crossByteMatch[2], 10),
      byteEnd: parseInt(crossByteMatch[3], 10),
      bitEnd: parseInt(crossByteMatch[4], 10),
    };
  }

  // Single byte+bit: B1.b5
  const singleByteBitMatch = range.match(/^B(\d+)\.b(\d+)$/);
  if (singleByteBitMatch) {
    const byte = parseInt(singleByteBitMatch[1], 10);
    const bit = parseInt(singleByteBitMatch[2], 10);
    return { byteStart: byte, bitStart: bit, byteEnd: byte, bitEnd: bit };
  }

  // Absolute bit range: bit[15-1] or bit[0]
  const absoluteBitMatch = range.match(/^bit\[(\d+)(?:-(\d+))?\]$/);
  if (absoluteBitMatch) {
    const bitStart = parseInt(absoluteBitMatch[1], 10);
    const bitEnd = absoluteBitMatch[2]
      ? parseInt(absoluteBitMatch[2], 10)
      : bitStart;
    return {
      bitStart: Math.min(bitStart, bitEnd),
      bitEnd: Math.max(bitStart, bitEnd),
    };
  }

  // Simple bit range: b7 or b0-b3
  const simpleBitMatch = range.match(/^b(\d+)(?:-b(\d+))?$/);
  if (simpleBitMatch) {
    const bitStart = parseInt(simpleBitMatch[1], 10);
    const bitEnd = simpleBitMatch[2]
      ? parseInt(simpleBitMatch[2], 10)
      : bitStart;
    return {
      bitStart: Math.min(bitStart, bitEnd),
      bitEnd: Math.max(bitStart, bitEnd),
    };
  }

  return null;
}

/**
 * Validate bit ranges for a single field.
 * Checks: INVALID_BIT_INDEX, INVALID_BYTE_INDEX, INVALID_BIT_RANGE, BIT_RANGE_OUT_OF_FIELD
 */
function validateFieldBitRanges(
  field: PacketFieldAst,
  diagnostics: PacketDslDiagnostic[],
  blockIndex: number,
  lineOffset: number,
): void {
  if (!field.bits || field.bits.length === 0) return;

  const fieldByteRange = parseByteRange(field.range);

  for (const bit of field.bits) {
    const parsed = parseBitRangeString(bit.bitRange);
    if (!parsed) continue;

    // Check byte index (only when explicit byte references exist)
    if (parsed.byteStart !== undefined && parsed.byteStart < 1) {
      diagnostics.push(
        makeError(
          DiagnosticCodes.INVALID_BYTE_INDEX,
          blockIndex,
          lineOffset,
          `Invalid byte index ${parsed.byteStart} in bit range "${bit.bitRange}" — byte must be >= 1`,
        ),
      );
    }
    if (parsed.byteEnd !== undefined && parsed.byteEnd < 1) {
      diagnostics.push(
        makeError(
          DiagnosticCodes.INVALID_BYTE_INDEX,
          blockIndex,
          lineOffset,
          `Invalid byte index ${parsed.byteEnd} in bit range "${bit.bitRange}" — byte must be >= 1`,
        ),
      );
    }

    // Check bit index (0-7 for bN and Bx.bN patterns; bit[N] allows any >= 0)
    const hasByteRef = parsed.byteStart !== undefined;
    if (hasByteRef) {
      if (parsed.bitStart < 0 || parsed.bitStart > 7) {
        diagnostics.push(
          makeError(
            DiagnosticCodes.INVALID_BIT_INDEX,
            blockIndex,
            lineOffset,
            `Invalid bit index ${parsed.bitStart} in bit range "${bit.bitRange}" — bit must be 0-7`,
          ),
        );
      }
      if (parsed.bitEnd < 0 || parsed.bitEnd > 7) {
        diagnostics.push(
          makeError(
            DiagnosticCodes.INVALID_BIT_INDEX,
            blockIndex,
            lineOffset,
            `Invalid bit index ${parsed.bitEnd} in bit range "${bit.bitRange}" — bit must be 0-7`,
          ),
        );
      }
    } else if (!bit.bitRange.startsWith("bit[")) {
      // Simple bit-only range (bN): validate 0-7; skip for absolute bit[N] ranges
      if (parsed.bitStart < 0 || parsed.bitStart > 7) {
        diagnostics.push(
          makeError(
            DiagnosticCodes.INVALID_BIT_INDEX,
            blockIndex,
            lineOffset,
            `Invalid bit index ${parsed.bitStart} in bit range "${bit.bitRange}" — bit must be 0-7`,
          ),
        );
      }
      if (parsed.bitEnd < 0 || parsed.bitEnd > 7) {
        diagnostics.push(
          makeError(
            DiagnosticCodes.INVALID_BIT_INDEX,
            blockIndex,
            lineOffset,
            `Invalid bit index ${parsed.bitEnd} in bit range "${bit.bitRange}" — bit must be 0-7`,
          ),
        );
      }
    }

    // Check range order: for cross-byte, compare byte then bit
    if (parsed.byteStart !== undefined && parsed.byteEnd !== undefined) {
      if (parsed.byteStart > parsed.byteEnd) {
        diagnostics.push(
          makeError(
            DiagnosticCodes.INVALID_BIT_RANGE,
            blockIndex,
            lineOffset,
            `Invalid bit range "${bit.bitRange}" — start byte (${parsed.byteStart}) > end byte (${parsed.byteEnd})`,
          ),
        );
      } else if (
        parsed.byteStart === parsed.byteEnd &&
        parsed.bitStart > parsed.bitEnd
      ) {
        diagnostics.push(
          makeError(
            DiagnosticCodes.INVALID_BIT_RANGE,
            blockIndex,
            lineOffset,
            `Invalid bit range "${bit.bitRange}" — start bit (${parsed.bitStart}) > end bit (${parsed.bitEnd}) in same byte`,
          ),
        );
      }
    }

    // Bit range exceeds field byte range (only for explicit byte references)
    if (
      fieldByteRange &&
      parsed.byteStart !== undefined &&
      parsed.byteEnd !== undefined
    ) {
      if (
        parsed.byteStart < fieldByteRange.start ||
        parsed.byteEnd > fieldByteRange.end
      ) {
        diagnostics.push(
          makeError(
            DiagnosticCodes.BIT_RANGE_OUT_OF_FIELD,
            blockIndex,
            lineOffset,
            `Bit range "${bit.bitRange}" exceeds field byte range ${formatRange(fieldByteRange)}`,
          ),
        );
      }
    }
  }
}
