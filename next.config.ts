import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phase 1 is intentionally minimal. Native/server-only packages (better-sqlite3,
  // the Agent SDK, etc.) get added to `serverExternalPackages` when we introduce them.
};

export default nextConfig;
