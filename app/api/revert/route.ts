/**
 * Revert an applied change by writing its stored old_value back to the store.
 * POST { id }
 */
import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/shopify/auth";
import { getChange, markReverted, type ChangeRow } from "@/lib/changes";
import {
  updateSeoTitle,
  updateSeoDescription,
  updateDescription,
  updateProductType,
  updateImageAlt,
  type MutationResult,
} from "@/lib/shopify/mutations";

export const dynamic = "force-dynamic";

function revertOne(c: ChangeRow): Promise<MutationResult> {
  const prior = c.oldValue ?? ""; // empty string clears the field back to its prior "unset" state
  switch (c.field) {
    case "seo_title":
      return updateSeoTitle(c.productId, prior);
    case "seo_description":
      return updateSeoDescription(c.productId, prior);
    case "description":
      return updateDescription(c.productId, prior);
    case "product_type":
      return updateProductType(c.productId, prior);
    case "image_alt":
      if (!c.mediaId) return Promise.resolve({ ok: false, error: "missing mediaId" });
      return updateImageAlt(c.mediaId, prior);
  }
}

export async function POST(req: Request) {
  try {
    const { id } = (await req.json().catch(() => ({}))) as { id?: string };
    if (!id) return NextResponse.json({ error: "Missing change id." }, { status: 400 });

    const change = getChange(id);
    if (!change) return NextResponse.json({ error: "Change not found." }, { status: 404 });
    if (change.status !== "applied") {
      return NextResponse.json(
        { error: `Change is ${change.status}; only applied changes can be reverted.` },
        { status: 400 },
      );
    }

    const token = await getAccessToken();
    if (!token.scopes.includes("write_products")) {
      return NextResponse.json({ error: "write_products scope required to revert." }, { status: 403 });
    }

    const res = await revertOne(change);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 });

    markReverted(id, Date.now());
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
