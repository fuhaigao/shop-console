/**
 * Typed, validated access to environment variables.
 *
 * Secrets (the Shopify client secret, the Anthropic key) are read here on the
 * server only and never sent to the browser. Do NOT import this from a client
 * component.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(
      `Missing required env var ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return v.trim();
}

export const env = {
  shop: {
    /** e.g. "your-store.myshopify.com" */
    get domain() {
      return required("SHOPIFY_SHOP_DOMAIN");
    },
    get clientId() {
      return required("SHOPIFY_CLIENT_ID");
    },
    get clientSecret() {
      return required("SHOPIFY_CLIENT_SECRET");
    },
    /** Admin API version; defaults to a known-good version if unset. */
    get apiVersion() {
      return process.env.SHOPIFY_API_VERSION?.trim() || "2026-01";
    },
  },
};
