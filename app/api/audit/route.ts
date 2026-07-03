/**
 * Product Audit — Phase 2.
 *
 * POST body: { limit?: number, withSuggestions?: boolean }
 *  1. Read up to `limit` products (read-only GraphQL).
 *  2. Run deterministic rules → structural findings (always).
 *  3. If withSuggestions, ask Claude to draft improved copy + qualitative notes,
 *     merged onto the findings. Still read-only — nothing is written.
 *
 * Returns an AuditResult. No write scope is touched anywhere in this path.
 */
import { NextResponse } from "next/server";
import { getProductCount, getProductsForAudit } from "@/lib/shopify/queries";
import { auditProducts } from "@/lib/audit/rules";
import { enrichWithAI } from "@/lib/audit/llm";
import type { AuditResult } from "@/lib/audit/types";

export const dynamic = "force-dynamic";
// AI enrichment cold-boots `claude` per product; give the route room.
export const maxDuration = 300;

const MAX_LIMIT = 100;

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      limit?: number;
      withSuggestions?: boolean;
    };
    const limit = Math.min(MAX_LIMIT, Math.max(1, body.limit ?? 25));
    const withSuggestions = body.withSuggestions ?? false;

    const [totalProducts, products] = await Promise.all([
      getProductCount(),
      getProductsForAudit(limit),
    ]);

    const ruleFindings = auditProducts(products);

    let findings = ruleFindings;
    let suggestionErrors: string[] = [];
    if (withSuggestions && products.length > 0) {
      const enriched = await enrichWithAI(products, ruleFindings);
      findings = enriched.findings;
      suggestionErrors = enriched.errors;
    }

    const result: AuditResult = {
      totalProducts,
      scannedCount: products.length,
      suggestionsIncluded: withSuggestions,
      findings,
      suggestionErrors,
    };
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
