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

    // Flag whether any write scope is present — Phase 1 expects read-only.
    const hasWriteScope = tokenInfo.scopes.some((s) => s.startsWith("write_"));

    return NextResponse.json({
      ok: true,
      shop,
      productCount,
      sample,
      auth: {
        scopes: tokenInfo.scopes,
        tokenExpiresAt: new Date(tokenInfo.expiresAt).toISOString(),
        hasWriteScope,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
