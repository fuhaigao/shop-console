"use client";

import { useCallback, useEffect, useState } from "react";
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

// Categories the write layer can apply. Match WriteField in lib/changes.ts exactly.
const WRITABLE = new Set(["seo_title", "seo_description", "description", "product_type", "image_alt"]);

function isApplyable(f: Finding): boolean {
  return (
    WRITABLE.has(f.category) &&
    !f.advisoryOnly &&
    typeof f.proposed === "string" &&
    f.proposed.trim() !== ""
  );
}

export default function AuditPage() {
  const [limit, setLimit] = useState(25);
  const [withSuggestions, setWithSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [hasWriteScope, setHasWriteScope] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setHasWriteScope(Boolean(d?.auth?.canWriteProducts)))
      .catch(() => setHasWriteScope(null));
  }, []);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    setSelected(new Set());
    setApplyMsg(null);
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

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  function selectAllApplyable() {
    const ids = (result?.findings ?? []).filter(isApplyable).map((f) => f.id);
    setSelected(new Set(ids));
  }

  async function applySelected() {
    if (!result) return;
    const chosen = result.findings.filter((f) => selected.has(f.id) && isApplyable(f));
    if (chosen.length === 0) return;
    setApplying(true);
    setApplyMsg(null);
    setError(null);
    try {
      const changes = chosen.map((f) => ({
        productId: f.productId,
        productTitle: f.productTitle,
        field: f.category, // matches WriteField
        mediaId: f.mediaId ?? null,
        newValue: f.proposed as string,
        source: f.source,
        rationale: f.message,
      }));
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setApplyMsg(
        `Applied ${data.applied}, failed ${data.failed}. See the History tab to review or revert.`,
      );
      // Drop applied findings from selection.
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }

  const counts = countBySeverity(result?.findings ?? []);
  const byProduct = groupByProduct(result?.findings ?? []);
  const applyableCount = (result?.findings ?? []).filter(isApplyable).length;

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: "32px 24px" }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Product Audit</h1>
        <p style={{ color: "var(--muted)", marginTop: 4 }}>
          Scan for missing / weak product content and SEO, then apply approved fixes.
          Automation targets meta fields (SEO title & description), the description,
          product type, and image alt text — never the storefront product title or URL.
        </p>
      </header>

      {hasWriteScope === false && (
        <div style={warnBox}>
          The app has read-only scopes, so <strong>Apply is disabled</strong>. To enable
          writes, add the <code>write_products</code> scope in the Dev Dashboard (release a
          new version → reinstall), then reload. You can still run the audit and review
          suggestions.
        </div>
      )}

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

      {error && <pre style={errBox}>{error}</pre>}
      {applyMsg && <div style={okBox}>{applyMsg}</div>}

      {result && (
        <>
          <section
            style={{
              margin: "20px 0",
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              color: "var(--muted)",
            }}
          >
            <span>
              Scanned <strong style={{ color: "var(--text)" }}>{result.scannedCount}</strong> of{" "}
              {result.totalProducts}. Found{" "}
              <strong style={{ color: "var(--text)" }}>{result.findings.length}</strong> findings.
            </span>
            {SEVERITY_ORDER.map((s) =>
              counts[s] ? (
                <span key={s} style={{ color: SEVERITY_COLOR[s] }}>
                  ● {counts[s]} {s}
                </span>
              ) : null,
            )}
            {applyableCount > 0 && (
              <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={selectAllApplyable} style={ghostBtn}>
                  Select all fixable ({applyableCount})
                </button>
                <button
                  onClick={applySelected}
                  disabled={applying || selected.size === 0 || hasWriteScope === false}
                  style={{ ...runBtn, marginLeft: 0, opacity: selected.size === 0 ? 0.5 : 1 }}
                  title={
                    hasWriteScope === false
                      ? "write_products scope required"
                      : "Apply the selected fixes"
                  }
                >
                  {applying ? "Applying…" : `Apply selected (${selected.size})`}
                </button>
              </span>
            )}
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

          {byProduct.length === 0 && <p style={{ color: "var(--green)" }}>No issues found. 🎉</p>}

          {byProduct.map(({ productId, productTitle, findings }) => (
            <div key={productId} style={productCard}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>{productTitle}</div>
              {findings.map((f) => (
                <FindingRow
                  key={f.id}
                  f={f}
                  selectable={isApplyable(f)}
                  checked={selected.has(f.id)}
                  onToggle={() => toggle(f.id)}
                />
              ))}
            </div>
          ))}
        </>
      )}
    </main>
  );
}

function FindingRow({
  f,
  selectable,
  checked,
  onToggle,
}: {
  f: Finding;
  selectable: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div style={{ padding: "10px 0", borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {selectable ? (
          <input type="checkbox" checked={checked} onChange={onToggle} />
        ) : (
          <span style={{ width: 13, display: "inline-block" }} />
        )}
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

const ghostBtn: React.CSSProperties = {
  background: "var(--border)",
  color: "var(--text)",
  border: "none",
  borderRadius: 8,
  padding: "6px 12px",
  cursor: "pointer",
  fontSize: 13,
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

const okBox: React.CSSProperties = {
  marginTop: 16,
  padding: 12,
  background: "rgba(63,185,80,0.08)",
  border: "1px solid var(--green)",
  borderRadius: 8,
  color: "#7ee787",
};

const warnBox: React.CSSProperties = {
  margin: "16px 0",
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
