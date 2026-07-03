/**
 * Connection health check — the Phase 1 deliverable.
 *
 * Verifies the full read path end to end: env → client-credentials token →
 * Admin GraphQL. Returns shop identity, granted scopes, token expiry, and a
 * small product sample. Purely read-only; no write scope is exercised.
 */
import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/shopify/auth";
import {
  getShopInfo,
  getProductCount,
  getProductSample,
} from "@/lib/shopify/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tokenInfo = await getAccessToken();
    const [shop, productCount, sample] = await Promise.all([
      getShopInfo(),
      getProductCount(),
      getProductSample(5),
    ]);

    // The only write scope this tool uses is write_products; that (not any
    // write_* scope) is what gates the Apply flow.
    const canWriteProducts = tokenInfo.scopes.includes("write_products");
    const otherWriteScopes = tokenInfo.scopes.filter(
      (s) => s.startsWith("write_") && s !== "write_products",
    );

    return NextResponse.json({
      ok: true,
      shop,
      productCount,
      sample,
      auth: {
        scopes: tokenInfo.scopes,
        tokenExpiresAt: new Date(tokenInfo.expiresAt).toISOString(),
        canWriteProducts,
        otherWriteScopes,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
