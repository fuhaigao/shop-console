/**
 * AI enrichment for the audit.
 *
 * The deterministic rules (rules.ts) find *what* is wrong. This step asks Claude
 * to (a) draft improved copy for the weak/missing fields and (b) surface
 * qualitative issues the rules can't see. It runs read-only: it proposes text,
 * it never writes. Proposals get merged onto the matching rule findings (filling
 * `proposed` for the before/after diff), and anything the AI improves beyond the
 * structural gaps becomes a new `source: "ai"` finding.
 *
 * Runs one product per `claude -p` call, with bounded concurrency. Per-product
 * failures are collected and surfaced, never silently dropped.
 */
import { claudeOneShot, parseJsonLoose } from "@/lib/claude";
import { SEO_TITLE_MAX, SEO_DESC_MIN, SEO_DESC_MAX, ALT_MAX } from "./rules";
import type { AuditProduct, Finding } from "./types";

const SYSTEM = `You are an expert Shopify merchandiser and SEO copywriter auditing one product.
Return ONLY raw JSON (no markdown fences, no prose) matching exactly this shape:
{
  "description": string | null,       // improved product description as plain text paragraphs, or null if the current one is already good
  "seoTitle": string | null,          // <= ${SEO_TITLE_MAX} chars, or null
  "seoDescription": string | null,    // ${SEO_DESC_MIN}-${SEO_DESC_MAX} chars, or null
  "imageAlts": [ { "mediaId": string, "alt": string } ],  // alt text (<= ${ALT_MAX} chars) for images that need it; [] if none
  "notes": [ string ]                 // short qualitative observations (voice, clarity, trust signals); [] if none
}
Rules: write in a concise, natural, benefit-driven voice. NEVER keyword-stuff. Only propose a field when you can genuinely improve it; otherwise use null. Base copy strictly on the product data given — do not invent specs, materials, or claims.`;

interface LlmProposal {
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  imageAlts: { mediaId: string; alt: string }[];
  notes: string[];
}

function userPrompt(p: AuditProduct, issues: Finding[]): string {
  return JSON.stringify(
    {
      product: {
        title: p.title,
        productType: p.productType,
        vendor: p.vendor,
        tags: p.tags,
        currentDescription: p.descriptionText,
        currentSeoTitle: p.seoTitle,
        currentSeoDescription: p.seoDescription,
        images: p.images.map((img) => ({ mediaId: img.mediaId, currentAlt: img.alt })),
      },
      detectedIssues: issues.map((f) => f.message),
    },
    null,
    2,
  );
}

/** Merge one product's AI proposal into its rule findings, adding AI-only findings where warranted. */
function mergeProposal(
  p: AuditProduct,
  ruleFindings: Finding[],
  proposal: LlmProposal,
): Finding[] {
  const findings = ruleFindings.map((f) => ({ ...f }));

  const attachOrCreate = (
    category: Finding["category"],
    proposed: string | null,
    field: string,
    current: string | null,
    aiMessage: string,
  ) => {
    if (proposed == null || proposed.trim() === "") return;
    const existing = findings.find((f) => f.category === category);
    if (existing) {
      existing.proposed = proposed;
    } else {
      findings.push({
        id: `${p.id}:${category}:ai`,
        productId: p.id,
        productTitle: p.title,
        productHandle: p.handle,
        category,
        severity: "low",
        source: "ai",
        message: aiMessage,
        field,
        current,
        proposed,
      });
    }
  };

  attachOrCreate(
    "description",
    proposal.description,
    "descriptionHtml",
    p.descriptionText,
    "AI suggests a stronger description.",
  );
  attachOrCreate("seo_title", proposal.seoTitle, "seo.title", p.seoTitle, "AI suggests a better SEO title.");
  attachOrCreate(
    "seo_description",
    proposal.seoDescription,
    "seo.description",
    p.seoDescription,
    "AI suggests a meta description.",
  );

  // Image alts: match by mediaId to the corresponding image_alt finding.
  for (const { mediaId, alt } of proposal.imageAlts ?? []) {
    if (!alt?.trim()) continue;
    const idx = p.images.findIndex((img) => img.mediaId === mediaId);
    const target = findings.find(
      (f) => f.category === "image_alt" && f.field === `media[${idx}].alt`,
    );
    if (target) {
      target.proposed = alt;
    } else if (idx >= 0) {
      findings.push({
        id: `${p.id}:image_alt:ai-${idx}`,
        productId: p.id,
        productTitle: p.title,
        productHandle: p.handle,
        category: "image_alt",
        severity: "low",
        source: "ai",
        message: `AI suggests alt text for image ${idx + 1}.`,
        field: `media[${idx}].alt`,
        current: p.images[idx].alt,
        proposed: alt,
      });
    }
  }

  // Qualitative notes → info-level AI findings.
  (proposal.notes ?? []).forEach((note, i) => {
    if (!note?.trim()) return;
    findings.push({
      id: `${p.id}:quality:ai-${i}`,
      productId: p.id,
      productTitle: p.title,
      productHandle: p.handle,
      category: "quality",
      severity: "info",
      source: "ai",
      message: note,
    });
  });

  return findings;
}

/** Enrich a batch. Groups the rule findings by product, calls Claude per product with bounded concurrency. */
export async function enrichWithAI(
  products: AuditProduct[],
  ruleFindings: Finding[],
  concurrency = 4,
): Promise<{ findings: Finding[]; errors: string[] }> {
  const byProduct = new Map<string, Finding[]>();
  for (const f of ruleFindings) {
    const arr = byProduct.get(f.productId) ?? [];
    arr.push(f);
    byProduct.set(f.productId, arr);
  }

  const errors: string[] = [];
  const results = new Map<string, Finding[]>();

  let cursor = 0;
  async function worker() {
    while (cursor < products.length) {
      const p = products[cursor++];
      const theirs = byProduct.get(p.id) ?? [];
      const res = await claudeOneShot({ system: SYSTEM, user: userPrompt(p, theirs) });
      if ("error" in res) {
        errors.push(`${p.title}: ${res.error}`);
        results.set(p.id, theirs); // keep rule findings even if AI failed
        continue;
      }
      const proposal = parseJsonLoose<LlmProposal>(res.text);
      if (!proposal) {
        errors.push(`${p.title}: could not parse AI response`);
        results.set(p.id, theirs);
        continue;
      }
      results.set(p.id, mergeProposal(p, theirs, proposal));
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, products.length) }, worker),
  );

  // Reassemble in product order, keeping any findings for products with no AI run.
  const enriched: Finding[] = [];
  for (const p of products) enriched.push(...(results.get(p.id) ?? byProduct.get(p.id) ?? []));
  return { findings: enriched, errors };
}
