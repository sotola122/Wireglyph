import { WireglyphError, type DiagramDiagnostic } from "./errors.ts";
import { parsePacketDsl, extractPacketBlocks } from "./parser/packet.ts";
import { extractNamedFenceBlocks } from "./parser/fences.ts";
import { validatePacketAst } from "./validate/packet.ts";
import { normalizePacket } from "./normalize/packet.ts";
import { adaptToNormalizedPacketDiagram } from "./normalize/packet-diagram.ts";
import {
  renderPacketPages,
  renderPacketSvgParity,
  PACKET_PAGE_BODY_BUDGET_PX,
  layoutPacketPages,
  type PacketSvgRenderOptions,
} from "./render/packet-svg.ts";
import type { PacketDSLAst, PacketDslDiagnostic } from "./ast/packet.ts";
import { parseRegisterMapDSL } from "./parser/register.ts";
import { parseMemoryMapDSL } from "./parser/memorymap.ts";
import { detectWireglyphKind } from "./detect.ts";

export {
  parsePacketDsl,
  parsePacketBlocks,
  extractPacketBlocks,
} from "./parser/packet.ts";
export { extractNamedFenceBlocks } from "./parser/fences.ts";
export { validatePacketAst } from "./validate/packet.ts";
export { normalizePacket } from "./normalize/packet.ts";
export { adaptToNormalizedPacketDiagram } from "./normalize/packet-diagram.ts";
export {
  renderPacketSvgParity,
  renderPacketPages,
  PACKET_PAGE_BODY_BUDGET_PX,
  layoutPacketPages,
} from "./render/packet-svg.ts";
export { escapeXml } from "./render/xml.ts";
export {
  packetSvgEmittedFontSize,
  PACKET_A4_MIN_LABEL_PT,
  PACKET_A4_BODY_WIDTH_MM,
  PACKET_A4_BODY_HEIGHT_MM,
} from "./layout/tokens.ts";
export type {
  ConnectorKind,
  BitsView,
  PresetName,
  NormalizedPacketDiagram,
  NormalizedPacketField,
  NormalizedPacketDetail,
  NormalizedPacketBit,
  DetailRowLayout,
  DetailPanelMeasure,
  RenderedSvgPage,
} from "./model/packet-diagram.ts";
export * from "./ast/packet.ts";
export { wrapPacketText, measureTextWidth } from "./layout/text.ts";
export type { PacketSvgRenderOptions };
export { WireglyphError, DiagramRenderError } from "./errors.ts";
export type { DiagramDiagnostic } from "./errors.ts";
export { parseRegisterMapDSL } from "./parser/register.ts";
export { parseMemoryMapDSL } from "./parser/memorymap.ts";
export { detectWireglyphKind } from "./detect.ts";
export type { WireglyphKind } from "./detect.ts";
export { svgId, validateCssFontFamily } from "./shared/svg-ids.ts";

export interface PacketParseContext {
  readonly blockIndex?: number;
  readonly lineOffset?: number;
}

export interface PacketParseApiResult {
  readonly ast: PacketDSLAst;
  readonly diagnostics: readonly PacketDslDiagnostic[];
}

export interface SvgPage {
  readonly pageIndex: number;
  readonly svg: string;
  readonly width: number;
  readonly height: number;
  readonly byteRanges: readonly { start: number; end: number }[];
}

export interface PacketRenderResult {
  readonly pages: readonly SvgPage[];
  readonly diagnostics: readonly PacketDslDiagnostic[];
}

export interface PacketRenderOptions extends PacketSvgRenderOptions {
  readonly contentWidthMm?: number;
  readonly contentHeightMm?: number;
  readonly minFontPt?: number;
}

function toDiagnostics(
  items: readonly PacketDslDiagnostic[],
): DiagramDiagnostic[] {
  return items.map((item) => ({
    code: item.code,
    severity: item.severity,
    message: item.message,
    line: item.line,
    column: 0,
  }));
}

function throwIfErrors(
  diagnostics: readonly PacketDslDiagnostic[],
  prefix: string,
): void {
  const errors = diagnostics.filter((item) => item.severity === "error");
  if (errors.length === 0) return;
  throw new WireglyphError(
    `${prefix}: ${errors[0]?.message ?? "packet render failed"}`,
    toDiagnostics(errors),
  );
}

export function parsePacketDSL(
  source: string,
  context: PacketParseContext = {},
): PacketParseApiResult {
  const diagnostics: PacketDslDiagnostic[] = [];
  const ast = parsePacketDsl(
    source,
    context.blockIndex ?? 0,
    context.lineOffset ?? 1,
    diagnostics,
  );
  return { ast, diagnostics };
}

function compilePacket(
  source: string,
  context?: PacketParseContext,
) {
  const parsed = parsePacketDSL(source, context);
  throwIfErrors(parsed.diagnostics, "packet");
  const validated = validatePacketAst(parsed.ast);
  const diagnostics = [...parsed.diagnostics, ...validated];
  throwIfErrors(diagnostics, "packet");
  const normalized = normalizePacket(parsed.ast, diagnostics as PacketDslDiagnostic[]);
  throwIfErrors(diagnostics, "packet");
  const diagram = adaptToNormalizedPacketDiagram(normalized);
  return { diagram, diagnostics };
}

function compileAst(ast: PacketDSLAst, prefix: string) {
  const validated = validatePacketAst(ast);
  throwIfErrors(validated, prefix);
  const diagnostics = [...validated];
  const normalized = normalizePacket(ast, diagnostics);
  throwIfErrors(diagnostics, prefix);
  return adaptToNormalizedPacketDiagram(normalized);
}

export function renderPacketSVG(
  source: string,
  options: PacketRenderOptions = {},
): string {
  const { diagram, diagnostics } = compilePacket(source);
  throwIfErrors(diagnostics, "packet");
  const pages = renderPacketPages(diagram, {
    ...options,
    paginate: false,
    standalone: true,
  });
  const svg = pages[0]?.svg;
  if (!svg) {
    throw new WireglyphError("packet: empty SVG", toDiagnostics(diagnostics));
  }
  if ((svg.match(/<svg\b/g) ?? []).length !== 1) {
    throw new WireglyphError("packet: renderPacketSVG must emit one SVG root");
  }
  return svg;
}

export function renderPacketSVGPages(
  source: string,
  options: PacketRenderOptions,
): PacketRenderResult {
  const { diagram, diagnostics } = compilePacket(source);
  const pages = renderPacketPages(diagram, {
    ...options,
    paginate: true,
    standalone: true,
  });
  return {
    pages: pages.map((page) => ({
      pageIndex: page.pageIndex,
      svg: page.svg,
      width: page.width,
      height: page.height,
      byteRanges: page.byteRanges,
    })),
    diagnostics: diagnostics.filter((item) => item.severity === "warning"),
  };
}

export function renderRegisterMapSVG(
  source: string,
  options: PacketRenderOptions = {},
): string {
  const parsed = parseRegisterMapDSL(source);
  const diagram = compileAst(parsed.ast, "registermap");
  const pages = renderPacketPages(diagram, {
    ...options,
    paginate: false,
    standalone: true,
  });
  const svg = pages[0]?.svg;
  if (!svg) throw new WireglyphError("registermap: empty SVG");
  return svg;
}

export function renderMemoryMapSVG(
  source: string,
  options: PacketRenderOptions = {},
): string {
  const parsed = parseMemoryMapDSL(source);
  const diagram = compileAst(parsed.ast, "memorymap");
  const pages = renderPacketPages(diagram, {
    ...options,
    paginate: false,
    standalone: true,
  });
  const svg = pages[0]?.svg;
  if (!svg) throw new WireglyphError("memorymap: empty SVG");
  return svg;
}

export function renderWireglyphSVG(
  source: string,
  options: PacketRenderOptions = {},
): string {
  const kind = detectWireglyphKind(source) ?? "packet";
  if (kind === "registermap") return renderRegisterMapSVG(source, options);
  if (kind === "memorymap") return renderMemoryMapSVG(source, options);
  return renderPacketSVG(source, options);
}

export function extractWireglyphBlocks(markdown: string) {
  return extractNamedFenceBlocks(markdown, [
    "packet",
    "registermap",
    "register",
    "memorymap",
    "memory-map",
  ]);
}

void PACKET_PAGE_BODY_BUDGET_PX;
void renderPacketSvgParity;
void extractPacketBlocks;
