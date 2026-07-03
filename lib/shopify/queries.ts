/**
 * Read-only Admin GraphQL queries.
 *
 * Phase 1 only needs enough to prove the connection: shop identity + a product
 * count + a small product sample. Broader read surface (SEO fields, images/alt
 * text, shop config) arrives with the Audit feature in a later phase.
 */
import { adminGraphQL } from "@/lib/shopify/client";

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
