/**
 * Shopify client-credentials grant.
 *
 * The Dev Dashboard app model (2026+) uses OAuth client credentials rather than
 * a static shpat_ token. We exchange client_id + client_secret for a short-lived
 * (24h) Admin API access token:
 *
 *   POST https://{shop}/admin/oauth/access_token
 *   Content-Type: application/x-www-form-urlencoded
 *   grant_type=client_credentials&client_id=...&client_secret=...
 *   -> { access_token, scope, expires_in: 86399 }
 *
 * Docs: https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/client-credentials-grant
 *
 * We cache the token in-process and refresh it a little before expiry. The cache
 * lives on globalThis so Next dev's HMR (which re-evaluates modules) doesn't throw
 * the token away and re-hit the token endpoint on every edit.
 */
import { env } from "@/lib/env";

export interface AccessToken {
  token: string;
  /** Scopes actually granted to the token, e.g. ["read_products"]. */
  scopes: string[];
  /** epoch ms when the token expires. */
  expiresAt: number;
}

interface TokenResponse {
  access_token: string;
  scope: string;
  expires_in: number;
}

// Refresh this many ms before the real expiry, to avoid using a token mid-flight
// as it lapses.
const REFRESH_SKEW_MS = 60_000;

const g = globalThis as unknown as {
  __shopConsoleToken?: AccessToken;
  __shopConsoleTokenInflight?: Promise<AccessToken>;
};

async function fetchToken(): Promise<AccessToken> {
  const url = `https://${env.shop.domain}/admin/oauth/access_token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: env.shop.clientId,
    client_secret: env.shop.clientSecret,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Shopify token exchange failed (${res.status} ${res.statusText}). ` +
        `Check SHOPIFY_SHOP_DOMAIN / CLIENT_ID / CLIENT_SECRET and that the app is installed. ${text}`.trim(),
    );
  }

  const data = (await res.json()) as TokenResponse;
  return {
    token: data.access_token,
    scopes: data.scope ? data.scope.split(/[,\s]+/).filter(Boolean) : [],
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

/**
 * Returns a valid Admin API access token, minting/refreshing as needed.
 * Concurrent callers during a refresh share one in-flight request.
 */
export async function getAccessToken(forceRefresh = false): Promise<AccessToken> {
  const cached = g.__shopConsoleToken;
  if (
    !forceRefresh &&
    cached &&
    cached.expiresAt - REFRESH_SKEW_MS > Date.now()
  ) {
    return cached;
  }

  if (!g.__shopConsoleTokenInflight) {
    g.__shopConsoleTokenInflight = fetchToken()
      .then((tok) => {
        g.__shopConsoleToken = tok;
        return tok;
      })
      .finally(() => {
        g.__shopConsoleTokenInflight = undefined;
      });
  }
  return g.__shopConsoleTokenInflight;
}
