/**
 * The reversible, provenance-tracked change log. Every write to the store is
 * recorded here with its prior value, so any change can be reverted and the full
 * history audited. This is the future-proofing backbone: later, Search Console
 * metrics can join on product_id to measure a change's impact.
 */
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

/** Fields the write layer can set. All string-valued (tags/title/handle excluded from automation). */
export type WriteField =
  | "seo_title"
  | "seo_description"
  | "description"
  | "product_type"
  | "image_alt";

export const WRITABLE_FIELDS: WriteField[] = [
  "seo_title",
  "seo_description",
  "description",
  "product_type",
  "image_alt",
];

export type ChangeStatus = "applied" | "failed" | "reverted";

export interface ChangeInput {
  productId: string;
  productTitle: string;
  field: WriteField;
  /** Required for image_alt (the MediaImage/File id). */
  mediaId?: string | null;
  newValue: string;
  source: "rule" | "ai";
  rationale?: string;
}

export interface ChangeRow {
  id: string;
  batchId: string;
  productId: string;
  productTitle: string;
  field: WriteField;
  mediaId: string | null;
  oldValue: string | null;
  newValue: string;
  source: string;
  rationale: string | null;
  status: ChangeStatus;
  error: string | null;
  appliedAt: number;
  revertedAt: number | null;
}

interface Raw {
  id: string;
  batch_id: string;
  product_id: string;
  product_title: string;
  field: WriteField;
  media_id: string | null;
  old_value: string | null;
  new_value: string;
  source: string;
  rationale: string | null;
  status: ChangeStatus;
  error: string | null;
  applied_at: number;
  reverted_at: number | null;
}

function toRow(r: Raw): ChangeRow {
  return {
    id: r.id,
    batchId: r.batch_id,
    productId: r.product_id,
    productTitle: r.product_title,
    field: r.field,
    mediaId: r.media_id,
    oldValue: r.old_value,
    newValue: r.new_value,
    source: r.source,
    rationale: r.rationale,
    status: r.status,
    error: r.error,
    appliedAt: r.applied_at,
    revertedAt: r.reverted_at,
  };
}

export function newBatchId(): string {
  return randomUUID();
}

export function recordChange(args: {
  batchId: string;
  input: ChangeInput;
  oldValue: string | null;
  status: ChangeStatus;
  error?: string | null;
  now: number;
}): ChangeRow {
  const id = randomUUID();
  db()
    .prepare(
      `INSERT INTO applied_changes
       (id, batch_id, product_id, product_title, field, media_id, old_value, new_value, source, rationale, status, error, applied_at, reverted_at)
       VALUES (@id, @batch_id, @product_id, @product_title, @field, @media_id, @old_value, @new_value, @source, @rationale, @status, @error, @applied_at, NULL)`,
    )
    .run({
      id,
      batch_id: args.batchId,
      product_id: args.input.productId,
      product_title: args.input.productTitle,
      field: args.input.field,
      media_id: args.input.mediaId ?? null,
      old_value: args.oldValue,
      new_value: args.input.newValue,
      source: args.input.source,
      rationale: args.input.rationale ?? null,
      status: args.status,
      error: args.error ?? null,
      applied_at: args.now,
    });
  return getChange(id)!;
}

export function getChange(id: string): ChangeRow | null {
  const r = db().prepare(`SELECT * FROM applied_changes WHERE id = ?`).get(id) as Raw | undefined;
  return r ? toRow(r) : null;
}

export function listChanges(limit = 200): ChangeRow[] {
  const rows = db()
    .prepare(`SELECT * FROM applied_changes ORDER BY applied_at DESC LIMIT ?`)
    .all(limit) as Raw[];
  return rows.map(toRow);
}

export function markReverted(id: string, now: number): void {
  db()
    .prepare(`UPDATE applied_changes SET status = 'reverted', reverted_at = ? WHERE id = ?`)
    .run(now, id);
}
