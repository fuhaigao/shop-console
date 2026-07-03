"use client";

import { useCallback, useEffect, useState } from "react";
import { ProposalDiff } from "@/components/ProposalDiff";

interface ChangeRow {
  id: string;
  productId: string;
  productTitle: string;
  field: string;
  oldValue: string | null;
  newValue: string;
  source: string;
  status: "applied" | "failed" | "reverted";
  error: string | null;
  appliedAt: number;
  revertedAt: number | null;
}

const FIELD_LABEL: Record<string, string> = {
  seo_title: "SEO title",
  seo_description: "Meta description",
  description: "Description",
  product_type: "Product type",
  image_alt: "Image alt text",
};

const STATUS_COLOR: Record<string, string> = {
  applied: "var(--green)",
  failed: "var(--red)",
  reverted: "var(--muted)",
};

export default function HistoryPage() {
  const [changes, setChanges] = useState<ChangeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/changes", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setChanges(data.changes as ChangeRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function revert(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch("/api/revert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: "32px 24px" }}>
      <header style={{ marginBottom: 20, display: "flex", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Change History</h1>
        <button onClick={load} disabled={loading} style={ghostBtn}>
          {loading ? "…" : "Refresh"}
        </button>
      </header>

      {error && <pre style={errBox}>{error}</pre>}
      {!loading && changes.length === 0 && (
        <p style={{ color: "var(--muted)" }}>No changes applied yet.</p>
      )}

      {changes.map((c) => (
        <div key={c.id} style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: STATUS_COLOR[c.status],
                display: "inline-block",
              }}
            />
            <strong style={{ fontSize: 13 }}>{c.productTitle}</strong>
            <span style={{ color: "var(--muted)", fontSize: 13 }}>
              · {FIELD_LABEL[c.field] ?? c.field}
            </span>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>· {c.source}</span>
            <span style={{ color: STATUS_COLOR[c.status], fontSize: 12 }}>· {c.status}</span>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>
              · {new Date(c.appliedAt).toLocaleString()}
            </span>
            {c.status === "applied" && (
              <button onClick={() => revert(c.id)} disabled={busy === c.id} style={{ ...ghostBtn, marginLeft: "auto" }}>
                {busy === c.id ? "Reverting…" : "Revert"}
              </button>
            )}
          </div>
          {c.error ? (
            <div style={{ color: "var(--red)", fontSize: 13, marginTop: 6 }}>{c.error}</div>
          ) : (
            <ProposalDiff current={c.oldValue} proposed={c.newValue} />
          )}
        </div>
      ))}
    </main>
  );
}

const card: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "14px 18px",
  marginBottom: 12,
};

const ghostBtn: React.CSSProperties = {
  background: "var(--border)",
  color: "var(--text)",
  border: "none",
  borderRadius: 8,
  padding: "5px 12px",
  cursor: "pointer",
  fontSize: 13,
};

const errBox: React.CSSProperties = {
  marginBottom: 16,
  padding: 12,
  background: "#1b1114",
  border: "1px solid var(--red)",
  borderRadius: 8,
  color: "#ffb4ab",
  whiteSpace: "pre-wrap",
};
