/**
 * The narrow write layer. Only the mutations Phase 3 needs exist here:
 *  - productUpdate for seo.title / seo.description / descriptionHtml / productType
 *  - fileUpdate for image alt text (the non-deprecated path; productUpdateMedia is deprecated)
 *
 * Deliberately narrow: no title/handle/status/price/inventory writes exist, so
 * even a bug can't touch them. Everything routes through adminGraphQL, which
 * requires the write_products scope — without it Shopify rejects at the auth layer.
 */
import { adminGraphQL } from "@/lib/shopify/client";

export type MutationResult = { ok: true } | { ok: false; error: string };

interface UserError {
  field?: string[] | null;
  message: string;
}

const PRODUCT_UPDATE = `
  mutation UpdateProduct($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id }
      userErrors { field message }
    }
  }
`;

/** Convert plain-text paragraphs to simple HTML if the value isn't already HTML. */
export function toDescriptionHtml(value: string): string {
  if (/<[a-z][\s\S]*>/i.test(value)) return value; // already contains tags
  return value
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

async function runProductUpdate(input: Record<string, unknown>): Promise<MutationResult> {
  try {
    const data = await adminGraphQL<{
      productUpdate: { userErrors: UserError[] };
    }>(PRODUCT_UPDATE, { product: input });
    const errs = data.productUpdate.userErrors;
    if (errs?.length) return { ok: false, error: errs.map((e) => e.message).join("; ") };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function updateSeoTitle(productId: string, title: string): Promise<MutationResult> {
  return runProductUpdate({ id: productId, seo: { title } });
}

export function updateSeoDescription(productId: string, description: string): Promise<MutationResult> {
  return runProductUpdate({ id: productId, seo: { description } });
}

export function updateDescription(productId: string, value: string): Promise<MutationResult> {
  return runProductUpdate({ id: productId, descriptionHtml: toDescriptionHtml(value) });
}

export function updateProductType(productId: string, productType: string): Promise<MutationResult> {
  return runProductUpdate({ id: productId, productType });
}

const FILE_UPDATE = `
  mutation UpdateFileAlt($files: [FileUpdateInput!]!) {
    fileUpdate(files: $files) {
      files { id alt }
      userErrors { field message code }
    }
  }
`;

export async function updateImageAlt(mediaId: string, alt: string): Promise<MutationResult> {
  try {
    const data = await adminGraphQL<{
      fileUpdate: { userErrors: (UserError & { code?: string })[] };
    }>(FILE_UPDATE, { files: [{ id: mediaId, alt }] });
    const errs = data.fileUpdate.userErrors;
    if (errs?.length) return { ok: false, error: errs.map((e) => e.message).join("; ") };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
