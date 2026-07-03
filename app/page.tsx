"use client";

import { useCallback, useEffect, useState } from "react";

interface HealthOk {
  ok: true;
  shop: {
    name: string;
    myshopifyDomain: string;
    primaryDomainUrl: string;
    currencyCode: string;
    plan: string;
  };
  productCount: number;
  sample: { id: string; title: string; handle: string; status: string }[];
  auth: { scopes: string[]; tokenExpiresAt: string; hasWriteScope: boolean };
}
interface HealthErr {
  ok: false;
  error: string;
}
type Health = HealthOk | HealthErr;

export default function Home() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(false);

  const check = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      setHealth((await res.json()) as Health);
    } catch (e) {
      setHealth({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  const dotColor = !health
    ? "var(--muted)"
    : health.ok
      ? "var(--green)"
      : "var(--red)";

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "48px 24px",
      }}
    >
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Shop Console</h1>
        <p style={{ color: "var(--muted)", marginTop: 4 }}>
          Phase 1 — read-only connection health check
        </p>
      </header>

      <section style={panel}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: dotColor,
              display: "inline-block",
            }}
          />
          <strong>
            {!health
              ? "Checking…"
              : health.ok
                ? "Connected"
                : "Connection failed"}
          </strong>
          <button onClick={check} disabled={loading} style={btn}>
            {loading ? "Checking…" : "Re-check"}
          </button>
        </div>

        {health?.ok && (
          <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
            <Row label="Store" value={`${health.shop.name} (${health.shop.plan})`} />
            <Row label="Domain" value={health.shop.myshopifyDomain} />
            <Row label="Currency" value={health.shop.currencyCode} />
            <Row label="Products" value={String(health.productCount)} />
            <Row label="Granted scopes" value={health.auth.scopes.join(", ") || "(none reported)"} />
            <Row
              label="Token expires"
              value={new Date(health.auth.tokenExpiresAt).toLocaleString()}
            />
            <Row
              label="Write access"
              value={
                health.auth.hasWriteScope
                  ? "⚠️ write scope present"
                  : "read-only ✓ (expected in Phase 1)"
              }
            />
            {health.sample.length > 0 && (
              <div>
                <div style={{ color: "var(--muted)", marginBottom: 6 }}>
                  Recently updated products
                </div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {health.sample.map((p) => (
                    <li key={p.id}>
                      {p.title}{" "}
                      <span style={{ color: "var(--muted)" }}>
                        ({p.status.toLowerCase()})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {health && !health.ok && (
          <pre
            style={{
              marginTop: 16,
              padding: 12,
              background: "#1b1114",
              border: "1px solid var(--red)",
              borderRadius: 8,
              color: "#ffb4ab",
              whiteSpace: "pre-wrap",
              overflowX: "auto",
            }}
          >
            {health.error}
          </pre>
        )}
      </section>

      <p style={{ color: "var(--muted)", marginTop: 24, fontSize: 12 }}>
        Copy <code>.env.example</code> → <code>.env</code> and fill in your
        Shopify credentials, then run <code>npm run dev</code>.
      </p>
    </main>
  );
}

const panel: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 20,
};

const btn: React.CSSProperties = {
  marginLeft: "auto",
  background: "var(--border)",
  color: "var(--text)",
  border: "none",
  borderRadius: 8,
  padding: "6px 12px",
  cursor: "pointer",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <span style={{ color: "var(--muted)", minWidth: 130 }}>{label}</span>
      <span style={{ wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}
