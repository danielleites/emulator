/**
 * PIVISION Mobile — global type declarations
 *
 * Stage 2 of the modernization plan. These ambient declarations describe
 * the runtime globals exposed by the legacy non-module scripts so that the
 * incrementally-migrated TypeScript code (and editor IntelliSense) can see
 * them without anybody having to convert the legacy files yet.
 *
 * As legacy modules are ported in stages 2–3, their entries here move
 * into proper ESM exports and these declarations get trimmed.
 */

// ──────────────────────────────────────────────────────────────────────────
// SafeDOM — js/security/safe-dom.js
// ──────────────────────────────────────────────────────────────────────────

export interface SafeDOMAPI {
  /** Sanitize an HTML string. */
  sanitize(html: string, opts?: unknown): string;
  /** Replace `el.innerHTML` with sanitized HTML. */
  setSafeHTML(el: Element | null, html: string, opts?: unknown): void;
  /** Append sanitized HTML to `el`. */
  appendSafeHTML(el: Element | null, html: string, opts?: unknown): void;
  /** Build a DocumentFragment from sanitized HTML. */
  safeFragment(html: string, opts?: unknown): DocumentFragment;
  /** Escape a value for inclusion in HTML attribute or text content. */
  escape(value: unknown): string;
}

// ──────────────────────────────────────────────────────────────────────────
// SafeExpr — js/security/safe-expr.js
// ──────────────────────────────────────────────────────────────────────────

export interface SafeExprAPI {
  /** Evaluate an Angular-template expression against a scope. */
  evaluate(expr: string, scope: unknown): unknown;
  /** Assign a value to a simple lvalue expression (`a`, `a.b`, `a["b"]`). */
  assign(expr: string, scope: unknown, value: unknown): void;
}

// ──────────────────────────────────────────────────────────────────────────
// PIVision app namespace (legacy globals)
// ──────────────────────────────────────────────────────────────────────────

export interface PIVisionGlobal {
  version: string;
  config?: Record<string, unknown>;
  ready?: Promise<void>;
}

// ──────────────────────────────────────────────────────────────────────────
// Window augmentation
// ──────────────────────────────────────────────────────────────────────────

declare global {
  interface Window {
    SafeDOM: SafeDOMAPI;
    SafeExpr: SafeExprAPI;
    DOMPurify?: { sanitize(html: string, opts?: unknown): string };
    PIVision?: PIVisionGlobal;
    /**
     * Hardening switch — set to `false` to forbid the legacy
     * `new Function` fallback in `emu-shims.js` even if SafeExpr is
     * missing. Defaults to `true` for compatibility.
     */
    PIVISION_ALLOW_UNSAFE_EVAL?: boolean;
    /** Cordova bootstrap object (only present on mobile). */
    cordova?: unknown;
  }
}

export {};
