/**
 * Pre-write snapshots. Before any batch of writes, we dump the current values of
 * every affected product to ~/.shopconsole/snapshots/<batchId>.json as a
 * belt-and-suspenders rollback source (the change log also stores per-field old
 * values, but a full snapshot is cheap insurance on a live store).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "@/lib/db";
import type { ProductFields } from "@/lib/shopify/queries";

export function writeSnapshot(batchId: string, products: ProductFields[]): string {
  const dir = join(DATA_DIR, "snapshots");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${batchId}.json`);
  writeFileSync(path, JSON.stringify({ batchId, capturedAt: Date.now(), products }, null, 2));
  return path;
}
