/**
 * Deterministic audit rules — pure functions over product data, no LLM.
 *
 * These catch *structural* gaps exactly and cheaply (empty fields, bad lengths,
 * missing alt text). Qualitative judgment ("this copy is thin/keyword-stuffed")
 * and the proposed rewrites are layered on by the AI step (llm.ts). Because
 * these are pure, they're unit-testable with mock products and never hallucinate.
 *
 * SEO thresholds encode common best practice so the audit teaches as it flags:
 *  - SEO title: Google typically renders ~50–60 chars before truncating.
 *  - Meta description: ~120–160 chars is the sweet spot for SERP snippets.
 *  - Alt text: describe the image for accessibility + image search; keep ≤125 chars.
 */
import type { AuditProduct, Finding, Severity } from "./types";

export const SEO_TITLE_MIN = 30;
export const SEO_TITLE_MAX = 60;
export const SEO_DESC_MIN = 120;
export const SEO_DESC_MAX = 160;
export const SEO_DESC_HARD_MIN = 70;
export const ALT_MAX = 125;
export const DESC_THIN_WORDS = 30;
export const TAGS_MIN = 2;

const GENERIC_ALT = new Set([
  "image",
  "photo",
  "picture",
  "product",
  "product image",
  "img",
]);

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function mk(
  p: AuditProduct,
  category: Finding["category"],
  key: string,
  severity: Severity,
  message: string,
  extra: Partial<Finding> = {},
): Finding {
  return {
    id: `${p.id}:${category}:${key}`,
    productId: p.id,
    productTitle: p.title,
    productHandle: p.handle,
    category,
    severity,
    source: "rule",
    message,
    ...extra,
  };
}

/** Run all deterministic rules over one product. */
export function auditProduct(p: AuditProduct): Finding[] {
  const out: Finding[] = [];

  // --- Description ---
  const descWords = wordCount(p.descriptionText);
  if (descWords === 0) {
    out.push(
      mk(p, "description", "empty", "high", "Product has no description.", {
        field: "descriptionHtml",
        current: "",
      }),
    );
  } else if (descWords < DESC_THIN_WORDS) {
    out.push(
      mk(
        p,
        "description",
        "thin",
        "medium",
        `Description is thin (${descWords} words). Aim for a fuller, benefit-driven description.`,
        { field: "descriptionHtml", current: p.descriptionText },
      ),
    );
  }

  // --- SEO title ---
  const seoTitle = p.seoTitle?.trim() ?? "";
  if (!seoTitle) {
    out.push(
      mk(
        p,
        "seo_title",
        "missing",
        "medium",
        "No SEO title set — search engines fall back to the product title, which may not be optimal.",
        { field: "seo.title", current: null },
      ),
    );
  } else if (seoTitle.length > SEO_TITLE_MAX) {
    out.push(
      mk(
        p,
        "seo_title",
        "long",
        "medium",
        `SEO title is ${seoTitle.length} chars; it will likely be truncated in search results (keep ≤ ${SEO_TITLE_MAX}).`,
        { field: "seo.title", current: seoTitle },
      ),
    );
  } else if (seoTitle.length < SEO_TITLE_MIN) {
    out.push(
      mk(
        p,
        "seo_title",
        "short",
        "low",
        `SEO title is short (${seoTitle.length} chars); there's room to add descriptive, searchable terms.`,
        { field: "seo.title", current: seoTitle },
      ),
    );
  }

  // --- SEO meta description ---
  const seoDesc = p.seoDescription?.trim() ?? "";
  if (!seoDesc) {
    out.push(
      mk(
        p,
        "seo_description",
        "missing",
        "high",
        "No meta description — you're ceding control of the search-result snippet to auto-generated text.",
        { field: "seo.description", current: null },
      ),
    );
  } else if (seoDesc.length > SEO_DESC_MAX) {
    out.push(
      mk(
        p,
        "seo_description",
        "long",
        "medium",
        `Meta description is ${seoDesc.length} chars; it will be truncated (keep ${SEO_DESC_MIN}–${SEO_DESC_MAX}).`,
        { field: "seo.description", current: seoDesc },
      ),
    );
  } else if (seoDesc.length < SEO_DESC_HARD_MIN) {
    out.push(
      mk(
        p,
        "seo_description",
        "short",
        "low",
        `Meta description is short (${seoDesc.length} chars); aim for ${SEO_DESC_MIN}–${SEO_DESC_MAX} to fill the snippet.`,
        { field: "seo.description", current: seoDesc },
      ),
    );
  }

  // --- Images / alt text ---
  if (p.images.length === 0) {
    out.push(
      mk(p, "image_alt", "no-images", "high", "Product has no images.", {
        field: "media",
      }),
    );
  } else {
    p.images.forEach((img, i) => {
      const alt = img.alt?.trim() ?? "";
      if (!alt) {
        out.push(
          mk(
            p,
            "image_alt",
            `missing-${i}`,
            "medium",
            `Image ${i + 1} has no alt text (hurts accessibility and image SEO).`,
            { field: `media[${i}].alt`, current: null },
          ),
        );
      } else if (
        GENERIC_ALT.has(alt.toLowerCase()) ||
        alt.toLowerCase() === p.title.toLowerCase()
      ) {
        out.push(
          mk(
            p,
            "image_alt",
            `generic-${i}`,
            "low",
            `Image ${i + 1} alt text is generic ("${alt}"); describe what's actually shown.`,
            { field: `media[${i}].alt`, current: alt },
          ),
        );
      } else if (alt.length > ALT_MAX) {
        out.push(
          mk(
            p,
            "image_alt",
            `long-${i}`,
            "low",
            `Image ${i + 1} alt text is long (${alt.length} chars); keep it concise (≤ ${ALT_MAX}).`,
            { field: `media[${i}].alt`, current: alt },
          ),
        );
      }
    });
  }

  // --- Merchandising metadata ---
  if (!p.productType.trim()) {
    out.push(
      mk(
        p,
        "product_type",
        "missing",
        "low",
        "No product type set — used for organization, filtering, and some SEO.",
        { field: "productType", current: null },
      ),
    );
  }
  if (!p.vendor.trim()) {
    out.push(
      mk(p, "vendor", "missing", "info", "No vendor/brand set.", {
        field: "vendor",
        current: null,
      }),
    );
  }
  if (p.tags.length < TAGS_MIN) {
    out.push(
      mk(
        p,
        "tags",
        "few",
        "low",
        `Only ${p.tags.length} tag(s); tags aid on-site search, filtering, and collections.`,
        { field: "tags", current: p.tags.join(", ") },
      ),
    );
  }

  // --- Advisory-only (recommend, never auto-execute) ---
  if (/(copy|untitled|\d{6,})/i.test(p.handle)) {
    out.push(
      mk(
        p,
        "handle",
        "weak",
        "low",
        `Handle "${p.handle}" looks auto-generated. A descriptive URL helps SEO — but changing it breaks existing links, so weigh carefully.`,
        { field: "handle", current: p.handle, advisoryOnly: true },
      ),
    );
  }
  if (p.status !== "ACTIVE") {
    out.push(
      mk(
        p,
        "status",
        "not-active",
        "info",
        `Product status is ${p.status} — not visible to shoppers. Intentional?`,
        { field: "status", current: p.status, advisoryOnly: true },
      ),
    );
  }

  return out;
}

/** Run rules across a batch. */
export function auditProducts(products: AuditProduct[]): Finding[] {
  return products.flatMap(auditProduct);
}
