"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Connection" },
  { href: "/audit", label: "Product Audit" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "10px 24px",
        borderBottom: "1px solid var(--border)",
        background: "var(--panel)",
      }}
    >
      <span style={{ fontWeight: 700, marginRight: 16 }}>Shop Console</span>
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            style={{
              color: active ? "var(--text)" : "var(--muted)",
              background: active ? "var(--border)" : "transparent",
              padding: "6px 12px",
              borderRadius: 8,
              textDecoration: "none",
              fontSize: 13,
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
