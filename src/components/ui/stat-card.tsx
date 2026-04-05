import { ReactNode } from "react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  trend?: { value: number; label: string };
  variant?: "default" | "primary" | "success" | "warning" | "destructive";
}

const variantStyles: Record<string, { border: string; iconBg: string; iconColor: string; valueColor: string; accentLine: string }> = {
  default: {
    border: "rgba(59,74,70,0.3)",
    iconBg: "rgba(113,255,232,0.06)",
    iconColor: "#71ffe8",
    valueColor: "#dfe2eb",
    accentLine: "#71ffe8",
  },
  primary: {
    border: "rgba(113,255,232,0.15)",
    iconBg: "rgba(113,255,232,0.08)",
    iconColor: "#71ffe8",
    valueColor: "#71ffe8",
    accentLine: "#71ffe8",
  },
  success: {
    border: "rgba(113,255,232,0.12)",
    iconBg: "rgba(113,255,232,0.07)",
    iconColor: "#71ffe8",
    valueColor: "#dfe2eb",
    accentLine: "#71ffe8",
  },
  warning: {
    border: "rgba(249,188,72,0.2)",
    iconBg: "rgba(249,188,72,0.08)",
    iconColor: "#f9bc48",
    valueColor: "#f9bc48",
    accentLine: "#f9bc48",
  },
  destructive: {
    border: "rgba(255,180,171,0.2)",
    iconBg: "rgba(255,180,171,0.08)",
    iconColor: "#ffb4ab",
    valueColor: "#ffb4ab",
    accentLine: "#ffb4ab",
  },
};

export function StatCard({ title, value, icon, trend, variant = "default" }: StatCardProps) {
  const styles = variantStyles[variant];

  return (
    <div
      className="relative overflow-hidden group transition-all duration-300"
      style={{
        background: '#161B22',
        border: `1px solid ${styles.border}`,
        padding: '1.5rem',
      }}
    >
      {/* Top row */}
      <div className="flex justify-between items-start mb-4">
        <span
          className="text-[10px] font-bold uppercase tracking-widest"
          style={{ color: '#849490', fontFamily: 'IBM Plex Mono, monospace' }}
        >
          {title}
        </span>
        <div
          className="w-8 h-8 flex items-center justify-center"
          style={{ background: styles.iconBg, color: styles.iconColor }}
        >
          {icon}
        </div>
      </div>

      {/* Value */}
      <div
        className="font-headline text-3xl font-extrabold tracking-tighter"
        style={{ color: styles.valueColor }}
      >
        {value}
      </div>

      {/* Trend */}
      {trend && (
        <div
          className="mt-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
          style={{ color: trend.value >= 0 ? '#71ffe8' : '#ffb4ab', fontFamily: 'IBM Plex Mono, monospace' }}
        >
          {trend.value >= 0 ? "↑" : "↓"} {Math.abs(trend.value)}% {trend.label}
        </div>
      )}

      {/* Bottom accent line */}
      <div
        className="absolute bottom-0 left-0 h-[2px] w-full opacity-20"
        style={{ background: styles.accentLine }}
      />
      <div
        className="absolute bottom-0 left-0 h-[2px] w-0 group-hover:w-full transition-all duration-500"
        style={{ background: styles.accentLine }}
      />
    </div>
  );
}