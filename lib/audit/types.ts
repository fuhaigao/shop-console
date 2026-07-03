/**
 * Audit domain types. Shared by the deterministic rule scanner (rules.ts),
 * the AI enrichment step (llm.ts), the API route, and the UI.
 */

export type Severity = "high" | "medium" | "low" | "info";

export type FindingCategory =
  | "description"
  | "seo_title"
  | "seo_description"
  | "image_alt"
  | "product_type"
  | "vendor"
  | "tags"
  | "handle"
  | "status"
  | "quality"; // qualitative, AI-surfaced

/** Where a finding came from — a deterministic rule, or the AI reviewer. */
export type FindingSource = "rule" | "ai";

export interface Finding {
  /** Stable within one audit run: `${productId}:${category}:${key}`. */
  id: string;
  productId: string;
  productTitle: string;
  productHandle: string;
  category: FindingCategory;
  severity: Severity;
  source: FindingSource;
  /** Human-readable description of the issue / recommendation. */
  message: string;
  /** The API field this concerns, e.g. "seo.title", "media[2].alt". */
  field?: string;
  /** Current value, for the before/after diff. */
  current?: string | null;
  /** AI-proposed replacement, for the before/after diff. Filled only when suggestions run. */
  proposed?: string | null;
  /**
   * Advisory findings are recommend-only and must NEVER be auto-executed even
   * once writes are enabled (handles/URLs, status, structural changes).
   */
  advisoryOnly?: boolean;
}

/** A product's audit-relevant fields, read-only. */
export interface AuditImage {
  /** MediaImage id (used later to target alt-text writes). */
  mediaId: string;
  url: string;
  alt: string | null;
}

export interface AuditProduct {
  id: string;
  title: string;
  handle: string;
  /** ACTIVE | DRAFT | ARCHIVED */
  status: string;
  descriptionHtml: string;
  /** Plain-text description (Shopify-stripped), used for length/word checks. */
  descriptionText: string;
  productType: string;
  vendor: string;
  tags: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  images: AuditImage[];
}

export interface AuditResult {
  totalProducts: number;
  scannedCount: number;
  suggestionsIncluded: boolean;
  findings: Finding[];
  /** Non-fatal per-product AI errors, surfaced rather than hidden. */
  suggestionErrors: string[];
}
