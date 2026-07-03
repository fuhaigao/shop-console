/**
 * Thin wrapper over the Shopify Admin GraphQL API.
 *
 * Everything the agent's read tools and (later) gated write tools do funnels
 * through here, so this is the single place we handle auth headers, the
 * cost-based rate limit (leaky bucket via the `throttled` error code), and
 * transport errors. Because it's our own layer, dropping to raw GraphQL if the
 * Agent SDK ever limits us is trivial.
 */
import { env } from "@/lib/env";
import { getAccessToken } from "@/lib/shopify/auth";

export interface GraphQLError {
  message: string;
  extensions?: { code?: string; [k: string]: unknown };
}

export class ShopifyGraphQLError extends Error {
  constructor(
    message: string,
    readonly errors: GraphQLError[],
    readonly status: number,
  ) {
    super(message);
    this.name = "ShopifyGraphQLError";
  }
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
  extensions?: {
    cost?: {
      requestedQueryCost: number;
      actualQueryCost: number;
      throttleStatus: {
        maximumAvailable: number;
        currentlyAvailable: number;
        restoreRate: number;
      };
    };
  };
}

const MAX_THROTTLE_RETRIES = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Run an Admin GraphQL operation. Retries automatically on Shopify's
 * cost-based THROTTLED errors, backing off based on the reported restore rate.
 */
export async function adminGraphQL<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const url = `https://${env.shop.domain}/admin/api/${env.shop.apiVersion}/graphql.json`;

  for (let attempt = 0; ; attempt++) {
    // Normal path uses the cached token; the 401/403 branch below forces a
    // refresh and re-enters the loop when the token is stale.
    const { token } = await getAccessToken();

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    });

    // 401/403 → token likely stale or scope missing. Refresh once, then surface.
    if (res.status === 401 || res.status === 403) {
      if (attempt === 0) {
        await getAccessToken(true);
        continue;
      }
      const text = await res.text().catch(() => "");
      throw new ShopifyGraphQLError(
        `Shopify auth rejected (${res.status}). The token may lack the required scope. ${text}`.trim(),
        [],
        res.status,
      );
    }

    const json = (await res.json()) as GraphQLResponse<T>;

    const throttled = json.errors?.some(
      (e) => e.extensions?.code === "THROTTLED",
    );
    if (throttled && attempt < MAX_THROTTLE_RETRIES) {
      const status = json.extensions?.cost?.throttleStatus;
      const need = json.extensions?.cost?.requestedQueryCost ?? 100;
      const restoreRate = status?.restoreRate ?? 50;
      const waitMs = Math.max(500, Math.ceil((need / restoreRate) * 1000));
      await sleep(waitMs);
      continue;
    }

    if (json.errors && json.errors.length > 0) {
      throw new ShopifyGraphQLError(
        json.errors.map((e) => e.message).join("; "),
        json.errors,
        res.status,
      );
    }

    if (!json.data) {
      throw new ShopifyGraphQLError("Empty GraphQL response", [], res.status);
    }

    return json.data;
  }
}
