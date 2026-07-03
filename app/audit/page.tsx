"use client";

import { useState } from "react";
import { ProposalDiff } from "@/components/ProposalDiff";
import type { AuditResult, Finding, Severity } from "@/lib/audit/types";

const SEVERITY_ORDER: Severity[] = ["high", "medium", "low", "info"];
const SEVERITY_COLOR: Record<Severity, string> = {
  high: "var(--red)",
  medium: "var(--amber)",
  low: "#58a6ff",
  info: "var(--muted)",
};

const CATEGORY_LABEL: Record<string, string> = {
  description: "Description",
  seo_title: "SEO title",
  seo_description: "Meta description",
  image_alt: "Image alt text",
  product_type: "Product type",
  vendor: "Vendor",
  tags: "Tags",
  handle: "URL handle",
  status: "Status",
  quality: "Quality (AI)",
};

export default function AuditPage() {
  const [limit, setLimit] = useState(25);
  const [withSuggestions, setWithSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit, withSuggestions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as AuditResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const counts = countBySeverity(result?.findings ?? []);
  const byProduct = groupByProduct(result?.findings ?? []);

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: "32px 24px" }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Product Audit</h1>
        <p style={{ color: "var(--muted)", marginTop: 4 }}>
          Read-only scan for missing / weak product content and SEO. No changes are
          written to your store.
        </p>
      </header>

      <section
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 16,
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          Products
          <input
            type="number"
            min={1}
            max={100}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            style={inputStyle}
          />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={withSuggestions}
            onChange={(e) => setWithSuggestions(e.target.checked)}
          />
          Include AI suggestions (slower)
        </label>
        <button onClick={run} disabled={loading} style={runBtn}>
          {loading ? "Scanning…" : "Run audit"}
        </button>
      </section>

      {error && (
        <pre style={errBox}>{error}</pre>
      )}

      {result && (
        <>
          <section style={{ margin: "20px 0", color: "var(--muted)" }}>
            Scanned <strong style={{ color: "var(--text)" }}>{result.scannedCount}</strong> of{" "}
            {result.totalProducts} products
            {result.scannedCount < result.totalProducts &&
              " (raise the Products limit to scan more)"}
            . Found{" "}
            <strong style={{ color: "var(--text)" }}>{result.findings.length}</strong> findings.
            <span style={{ marginLeft: 12 }}>
              {SEVERITY_ORDER.map((s) =>
                counts[s] ? (
                  <span key={s} style={{ marginRight: 12, color: SEVERITY_COLOR[s] }}>
                    ● {counts[s]} {s}
                  </span>
                ) : null,
              )}
            </span>
          </section>

          {result.suggestionErrors.length > 0 && (
            <div style={warnBox}>
              {result.suggestionErrors.length} product(s) had AI suggestion errors:
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {result.suggestionErrors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {byProduct.length === 0 && (
            <p style={{ color: "var(--green)" }}>No issues found. 🎉</p>
          )}

          {byProduct.map(({ productId, productTitle, findings }) => (
            <div key={productId} style={productCard}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>{productTitle}</div>
              {findings.map((f) => (
                <FindingRow key={f.id} f={f} />
              ))}
            </div>
          ))}
        </>
      )}
    </main>
  );
}

function FindingRow({ f }: { f: Finding }) {
  return (
    <div style={{ padding: "10px 0", borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: SEVERITY_COLOR[f.severity],
            display: "inline-block",
          }}
        />
        <strong style={{ fontSize: 13 }}>{CATEGORY_LABEL[f.category] ?? f.category}</strong>
        {f.source === "ai" && <Tag>AI</Tag>}
        {f.advisoryOnly && <Tag>advisory</Tag>}
        <span style={{ color: "var(--muted)", fontSize: 13 }}>{f.message}</span>
      </div>
      {(f.current != null || f.proposed != null) && (
        <ProposalDiff current={f.current} proposed={f.proposed} />
      )}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        border: "1px solid var(--border)",
        borderRadius: 4,
        padding: "1px 5px",
        color: "var(--muted)",
      }}
    >
      {children}
    </span>
  );
}

function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const c: Record<Severity, number> = { high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) c[f.severity]++;
  return c;
}

function groupByProduct(
  findings: Finding[],
): { productId: string; productTitle: string; findings: Finding[] }[] {
  const map = new Map<string, { productId: string; productTitle: string; findings: Finding[] }>();
  for (const f of findings) {
    const entry = map.get(f.productId) ?? {
      productId: f.productId,
      productTitle: f.productTitle,
      findings: [],
    };
    entry.findings.push(f);
    map.set(f.productId, entry);
  }
  // Sort each product's findings by severity, then products by their worst severity.
  const rank = (s: Severity) => SEVERITY_ORDER.indexOf(s);
  const groups = Array.from(map.values());
  for (const g of groups) g.findings.sort((a, b) => rank(a.severity) - rank(b.severity));
  groups.sort((a, b) => rank(a.findings[0].severity) - rank(b.findings[0].severity));
  return groups;
}

const inputStyle: React.CSSProperties = {
  width: 64,
  background: "var(--bg)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "4px 8px",
};

const runBtn: React.CSSProperties = {
  marginLeft: "auto",
  background: "#238636",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "8px 16px",
  cursor: "pointer",
  fontWeight: 600,
};

const errBox: React.CSSProperties = {
  marginTop: 16,
  padding: 12,
  background: "#1b1114",
  border: "1px solid var(--red)",
  borderRadius: 8,
  color: "#ffb4ab",
  whiteSpace: "pre-wrap",
};

const warnBox: React.CSSProperties = {
  margin: "8px 0 16px",
  padding: 12,
  background: "rgba(210,153,34,0.08)",
  border: "1px solid var(--amber)",
  borderRadius: 8,
  fontSize: 13,
};

const productCard: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "14px 18px",
  marginBottom: 14,
};
