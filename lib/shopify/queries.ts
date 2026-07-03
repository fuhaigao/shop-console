/**
 * Read-only Admin GraphQL queries.
 *
 * Phase 1 only needs enough to prove the connection: shop identity + a product
 * count + a small product sample. Broader read surface (SEO fields, images/alt
 * text, shop config) arrives with the Audit feature in a later phase.
 */
import { adminGraphQL } from "@/lib/shopify/client";
import type { AuditProduct } from "@/lib/audit/types";

export interface ShopInfo {
  name: string;
  myshopifyDomain: string;
  primaryDomainUrl: string;
  currencyCode: string;
  plan: string;
}

export async function getShopInfo(): Promise<ShopInfo> {
  const data = await adminGraphQL<{
    shop: {
      name: string;
      myshopifyDomain: string;
      currencyCode: string;
      primaryDomain: { url: string };
      plan: { displayName: string };
    };
  }>(`
    query ShopInfo {
      shop {
        name
        myshopifyDomain
        currencyCode
        primaryDomain { url }
        plan { displayName }
      }
    }
  `);

  return {
    name: data.shop.name,
    myshopifyDomain: data.shop.myshopifyDomain,
    primaryDomainUrl: data.shop.primaryDomain.url,
    currencyCode: data.shop.currencyCode,
    plan: data.shop.plan.displayName,
  };
}

export async function getProductCount(): Promise<number> {
  const data = await adminGraphQL<{ productsCount: { count: number } }>(`
    query ProductCount {
      productsCount { count }
    }
  `);
  return data.productsCount.count;
}

export interface ProductSample {
  id: string;
  title: string;
  handle: string;
  status: string;
}

export async function getProductSample(first = 5): Promise<ProductSample[]> {
  const data = await adminGraphQL<{
    products: { nodes: ProductSample[] };
  }>(
    `
    query ProductSample($first: Int!) {
      products(first: $first, sortKey: UPDATED_AT, reverse: true) {
        nodes { id title handle status }
      }
    }
  `,
    { first },
  );
  return data.products.nodes;
}

// ── Audit read ────────────────────────────────────────────────────────────────

interface RawAuditProduct {
  id: string;
  title: string;
  handle: string;
  status: string;
  descriptionHtml: string | null;
  description: string | null;
  productType: string | null;
  vendor: string | null;
  tags: string[];
  seo: { title: string | null; description: string | null };
  media: {
    nodes: {
      // Only MediaImage nodes carry id/alt/image; others come back as {}.
      id?: string;
      alt?: string | null;
      image?: { url: string | null } | null;
    }[];
  };
}

const AUDIT_PRODUCTS_QUERY = `
  query AuditProducts($first: Int!, $after: String) {
    products(first: $first, after: $after, sortKey: UPDATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        handle
        status
        descriptionHtml
        description
        productType
        vendor
        tags
        seo { title description }
        media(first: 10) {
          nodes {
            ... on MediaImage {
              id
              alt
              image { url }
            }
          }
        }
      }
    }
  }
`;

function normalize(raw: RawAuditProduct): AuditProduct {
  return {
    id: raw.id,
    title: raw.title,
    handle: raw.handle,
    status: raw.status,
    descriptionHtml: raw.descriptionHtml ?? "",
    descriptionText: raw.description ?? "",
    productType: raw.productType ?? "",
    vendor: raw.vendor ?? "",
    tags: raw.tags ?? [],
    seoTitle: raw.seo?.title ?? null,
    seoDescription: raw.seo?.description ?? null,
    images: (raw.media?.nodes ?? [])
      .filter((n) => n.id) // drop non-MediaImage media (video, 3d, external)
      .map((n) => ({
        mediaId: n.id as string,
        url: n.image?.url ?? "",
        alt: n.alt ?? null,
      })),
  };
}

/**
 * Fetch up to `limit` most-recently-updated products with all audit-relevant
 * fields, paginating in pages of 50. Read-only.
 */
export async function getProductsForAudit(limit = 25): Promise<AuditProduct[]> {
  const out: AuditProduct[] = [];
  let after: string | null = null;

  while (out.length < limit) {
    const pageSize = Math.min(50, limit - out.length);
    const data: {
      products: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: RawAuditProduct[];
      };
    } = await adminGraphQL(AUDIT_PRODUCTS_QUERY, { first: pageSize, after });

    out.push(...data.products.nodes.map(normalize));
    if (!data.products.pageInfo.hasNextPage) break;
    after = data.products.pageInfo.endCursor;
  }

  return out.slice(0, limit);
}
