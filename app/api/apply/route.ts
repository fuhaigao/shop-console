/**
 * Apply approved changes — Phase 3, Tier 0/1 (fill gaps).
 *
 * POST { changes: ChangeInput[] }
 *  1. Guard: refuse unless the token has write_products (two-gate safety —
 *     the scope is the backstop, this is the app-level gate).
 *  2. Fetch current field values per affected product (authoritative old-values).
 *  3. Snapshot those products to disk (rollback insurance).
 *  4. Apply each change via the narrow mutation layer; record every attempt in
 *     the change log with its prior value (reversible) — successes AND failures.
 *
 * The app itself executes the mutations deterministically; no agent is in the
 * write path. Only approved, string-valued content fields are writable here.
 */
import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/shopify/auth";
import { getProductFields, type ProductFields } from "@/lib/shopify/queries";
import {
  updateSeoTitle,
  updateSeoDescription,
  updateDescription,
  updateProductType,
  updateImageAlt,
  type MutationResult,
} from "@/lib/shopify/mutations";
import {
  newBatchId,
  recordChange,
  WRITABLE_FIELDS,
  type ChangeInput,
} from "@/lib/changes";
import { writeSnapshot } from "@/lib/snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function oldValueFor(input: ChangeInput, fields: ProductFields): string | null {
  switch (input.field) {
    case "seo_title":
      return fields.seoTitle;
    case "seo_description":
      return fields.seoDescription;
    case "description":
      return fields.descriptionHtml || null;
    case "product_type":
      return fields.productType || null;
    case "image_alt":
      return fields.imageAlts.find((m) => m.mediaId === input.mediaId)?.alt ?? null;
  }
}

function applyOne(input: ChangeInput): Promise<MutationResult> {
  switch (input.field) {
    case "seo_title":
      return updateSeoTitle(input.productId, input.newValue);
    case "seo_description":
      return updateSeoDescription(input.productId, input.newValue);
    case "description":
      return updateDescription(input.productId, input.newValue);
    case "product_type":
      return updateProductType(input.productId, input.newValue);
    case "image_alt":
      if (!input.mediaId) return Promise.resolve({ ok: false, error: "missing mediaId for image_alt" });
      return updateImageAlt(input.mediaId, input.newValue);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { changes?: ChangeInput[] };
    const changes = (body.changes ?? []).filter(
      (c) => c && WRITABLE_FIELDS.includes(c.field) && typeof c.newValue === "string",
    );
    if (changes.length === 0) {
      return NextResponse.json({ error: "No valid changes provided." }, { status: 400 });
    }

    // Gate 1: write scope must be present.
    const token = await getAccessToken();
    if (!token.scopes.includes("write_products")) {
      return NextResponse.json(
        {
          error:
            "The app is not authorized to write. Add the write_products scope in the Dev Dashboard (release a new version, then reinstall), and try again.",
          scopes: token.scopes,
        },
        { status: 403 },
      );
    }

    // Fetch current values for affected products (authoritative old-values + snapshot).
    const productIds = [...new Set(changes.map((c) => c.productId))];
    const fieldsById = new Map<string, ProductFields>();
    for (const id of productIds) {
      const f = await getProductFields(id);
      if (f) fieldsById.set(id, f);
    }

    const batchId = newBatchId();
    const snapshotPath = writeSnapshot(batchId, [...fieldsById.values()]);

    const now = Date.now();
    const results = [];
    for (const input of changes) {
      const fields = fieldsById.get(input.productId);
      const oldValue = fields ? oldValueFor(input, fields) : null;
      const res = await applyOne(input);
      const row = recordChange({
        batchId,
        input,
        oldValue,
        status: res.ok ? "applied" : "failed",
        error: res.ok ? null : res.error,
        now,
      });
      results.push({ id: row.id, field: input.field, productId: input.productId, ...res });
    }

    const applied = results.filter((r) => r.ok).length;
    const failed = results.length - applied;
    return NextResponse.json({ batchId, snapshotPath, applied, failed, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
