import { cn } from "@/lib/utils";

type StatusVariant = "genuine" | "suspicious" | "active" | "recalled" | "expired" | "in_transit" | "delivered" | "sold" | "default";

const variants: Record<StatusVariant, string> = {
  genuine: "bg-success/10 text-success border-success/20",
  suspicious: "bg-destructive/10 text-destructive border-destructive/20",
  active: "bg-success/10 text-success border-success/20",
  recalled: "bg-destructive/10 text-destructive border-destructive/20",
  expired: "bg-muted text-muted-foreground border-border",
  in_transit: "bg-primary/10 text-primary border-primary/20",
  delivered: "bg-success/10 text-success border-success/20",
  sold: "bg-accent text-accent-foreground border-border",
  default: "bg-secondary text-secondary-foreground border-border",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const variant = (status.toLowerCase().replace(/\s/g, "_") as StatusVariant) || "default";
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border", variants[variant] || variants.default, className)}>
      {status === "genuine" && "✅ "}
      {status === "suspicious" && "❌ "}
      {status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ")}
    </span>
  );
}
