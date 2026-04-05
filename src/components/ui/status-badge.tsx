type StatusVariant = "genuine" | "suspicious" | "active" | "recalled" | "expired" | "in_transit" | "delivered" | "sold" | "default";

const variants: Record<StatusVariant, { bg: string; color: string; border: string; label: string }> = {
  genuine: { bg: "rgba(113,255,232,0.08)", color: "#71ffe8", border: "rgba(113,255,232,0.2)", label: "✓ Genuine" },
  suspicious: { bg: "rgba(255,180,171,0.08)", color: "#ffb4ab", border: "rgba(255,180,171,0.25)", label: "⚠ Suspicious" },
  active: { bg: "rgba(113,255,232,0.08)", color: "#71ffe8", border: "rgba(113,255,232,0.2)", label: "Active" },
  recalled: { bg: "rgba(255,180,171,0.08)", color: "#ffb4ab", border: "rgba(255,180,171,0.25)", label: "Recalled" },
  expired: { bg: "rgba(132,148,144,0.08)", color: "#849490", border: "rgba(132,148,144,0.2)", label: "Expired" },
  in_transit: { bg: "rgba(113,255,232,0.06)", color: "#00e5cc", border: "rgba(113,255,232,0.15)", label: "In Transit" },
  delivered: { bg: "rgba(113,255,232,0.08)", color: "#71ffe8", border: "rgba(113,255,232,0.2)", label: "Delivered" },
  sold: { bg: "rgba(65,74,83,0.4)", color: "#b0b9c4", border: "rgba(65,74,83,0.5)", label: "Sold" },
  default: { bg: "rgba(65,74,83,0.2)", color: "#849490", border: "rgba(65,74,83,0.3)", label: "Unknown" },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const key = status.toLowerCase().replace(/\s/g, "_") as StatusVariant;
  const style = variants[key] || variants.default;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${className || ""}`}
      style={{
        background: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
        fontFamily: 'IBM Plex Mono, monospace',
        borderRadius: '0',
        letterSpacing: '0.1em',
      }}
    >
      {style.label}
    </span>
  );
}