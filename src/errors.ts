export type DiagramDiagnosticSeverity = "error" | "warning";

export interface DiagramDiagnostic {
  readonly code: string;
  readonly severity: DiagramDiagnosticSeverity;
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
  readonly path?: string;
}

export class WireglyphError extends Error {
  readonly name = "WireglyphError";
  readonly diagnostics: readonly DiagramDiagnostic[];

  constructor(message: string, diagnostics: readonly DiagramDiagnostic[] = []) {
    super(message);
    this.diagnostics = diagnostics;
  }
}

/** @deprecated Use WireglyphError */
export const DiagramRenderError = WireglyphError;
