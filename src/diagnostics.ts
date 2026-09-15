import type { PacketDslDiagnostic } from "./ast/packet.ts";

/** Stable diagnostic code constants for packet DSL processing.
 *
 * Error codes follow the pattern PKT_E3xx (validation errors) and
 * PKT_W2xx (warnings). These codes must remain stable across versions
 * for tooling integration.
 */
export const DiagnosticCodes = {
  // Errors
  /** Invalid or unsupported diagram renderer */
  INVALID_RENDERER: "PKT_E301",
  /** Required field key is missing */
  MISSING_REQUIRED_KEY: "PKT_E302",
  /** Field byte ranges overlap */
  RANGE_OVERLAP: "PKT_E303",
  /** Gap detected between consecutive field byte ranges */
  RANGE_GAP: "PKT_E304",
  /** Invalid or malformed detail panel byte range */
  INVALID_DETAIL_RANGE: "PKT_E305",
  /** Line group exceeds maximum byte count for a single line */
  OVERSIZED_LINE_GROUP: "PKT_E306",
  /** SVG-forbidden content detected in labels or values */
  FORBIDDEN_SVG_CONTENT: "PKT_E307",
  /** Byte range string could not be parsed */
  INVALID_BYTE_RANGE: "PKT_E308",
  /** Referenced preset does not exist */
  INVALID_PRESET: "PKT_E309",
  /** Invalid semantic role value */
  INVALID_ROLE: "PKT_E310",
  /** Invalid bits view mode */
  INVALID_BITS_VIEW: "PKT_E311",
  /** Invalid connector type */
  INVALID_CONNECTOR: "PKT_E312",
  /** Unknown field key in field child declaration */
  UNKNOWN_FIELD_KEY: "PKT_E313",
  /** Invalid bit index (outside 0-7) */
  INVALID_BIT_INDEX: "PKT_E314",
  /** Invalid byte index (< 1) in bit range */
  INVALID_BYTE_INDEX: "PKT_E315",
  /** Invalid bit range (start > end or malformed) */
  INVALID_BIT_RANGE: "PKT_E316",
  /** Bit range exceeds parent field byte range */
  BIT_RANGE_OUT_OF_FIELD: "PKT_E317",
  // Warnings
  /** Text was truncated due to overflow */
  TEXT_OVERFLOW_TRUNCATION: "PKT_W201",
  /** Field label exceeds recommended character length */
  LONG_LABEL: "PKT_W202",
  /** Bit-level panel has high field density */
  HIGH_DENSITY: "PKT_W203",
  /** Wrap directive was omitted for a wide diagram */
  WRAP_OMITTED: "PKT_W204",
  /** Custom preset definitions are not supported in v1.6.0 */
  CUSTOM_PRESET_DEFINED: "PKT_W205",
} as const;

/** Create an error-level diagnostic with the given parameters. */
export function makeError(
  code: string,
  blockIndex: number,
  line: number,
  message: string,
  sourceExcerpt?: string,
): PacketDslDiagnostic {
  return { code, severity: "error", blockIndex, line, message, sourceExcerpt };
}

/** Create a warning-level diagnostic with the given parameters. */
export function makeWarning(
  code: string,
  blockIndex: number,
  line: number,
  message: string,
  sourceExcerpt?: string,
): PacketDslDiagnostic {
  return {
    code,
    severity: "warning",
    blockIndex,
    line,
    message,
    sourceExcerpt,
  };
}

/** Format a diagnostic into a human-readable string.
 *
 * Produces output like:
 *   [packet:PKT_E301] block=2 line=17: Invalid renderer "html-grid"
 *   | diagramRenderer: html-grid
 */
export function formatDiagnostic(d: PacketDslDiagnostic): string {
  let s = `[packet:${d.code}] block=${d.blockIndex} line=${d.line}: ${d.message}`;
  if (d.sourceExcerpt) {
    s += `\n  | ${d.sourceExcerpt}`;
  }
  return s;
}
