/**
 * Before/after view for a proposed field change. Read-only in Phase 2 — the
 * Apply/Reject controls arrive in Phase 3 when a gated write path exists. For
 * copy rewrites, side-by-side labeled blocks read more clearly than an inline
 * character diff.
 */

export function ProposalDiff({
  current,
  proposed,
}: {
  current?: string | null;
  proposed?: string | null;
}) {
  const hasCurrent = current != null && current !== "";
  const hasProposed = proposed != null && proposed !== "";
  if (!hasCurrent && !hasProposed) return null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: hasProposed ? "1fr 1fr" : "1fr",
        gap: 10,
        marginTop: 8,
      }}
    >
      <Block
        label={hasCurrent ? "Current" : "Current (empty)"}
        text={hasCurrent ? (current as string) : "—"}
        tone="current"
      />
      {hasProposed && (
        <Block label="Proposed" text={proposed as string} tone="proposed" />
      )}
    </div>
  );
}

function Block({
  label,
  text,
  tone,
}: {
  label: string;
  text: string;
  tone: "current" | "proposed";
}) {
  const border = tone === "proposed" ? "var(--green)" : "var(--border)";
  const bg = tone === "proposed" ? "rgba(63,185,80,0.08)" : "rgba(255,255,255,0.02)";
  return (
    <div
      style={{
        border: `1px solid ${border}`,
        background: bg,
        borderRadius: 8,
        padding: "8px 10px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          color: "var(--muted)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{text}</div>
    </div>
  );
}
