import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChartComponent } from "@/components/charts";
import {
  Package, Shield, AlertTriangle, QrCode, Truck, CheckCircle2,
  Link2, Plus, Send, Clock, TrendingUp, Activity
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

interface ScanDataPoint { date: string; value: number; }

function groupScansByDay(rows: { created_at: string }[]): ScanDataPoint[] {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const d = new Date(r.created_at);
    const k = `${d.getMonth() + 1}/${d.getDate()}`;
    counts[k] = (counts[k] || 0) + 1;
  }
  return Object.entries(counts).map(([date, value]) => ({ date, value }));
}

interface AlertRow {
  id: string;
  alert_type: string;
  severity: string;
  description: string;
  created_at: string;
  is_resolved: boolean;
  products: { name: string; product_code: string } | null;
}

export default function Dashboard() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [stats, setStats] = useState({ products: 0, flagged: 0, scans: 0, events: 0, alerts: 0, anchored: 0 });
  const [recentProducts, setRecentProducts] = useState<Tables<"products">[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<AlertRow[]>([]);
  const [scanChart, setScanChart] = useState<ScanDataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      if (role === "supplier" && user?.id) {
        const { count } = await supabase.from("supply_chain_events").select("id", { count: "exact", head: true }).eq("actor_id", user.id);
        setStats({ products: 0, flagged: 0, scans: 0, events: count || 0, alerts: 0, anchored: 0 });
      } else {
        const [prodRes, flagRes, scanRes, eventRes, anchoredRes, alertRes] = await Promise.all([
          supabase.from("products").select("id", { count: "exact", head: true }),
          supabase.from("products").select("id", { count: "exact", head: true }).eq("is_flagged", true),
          supabase.from("scan_logs").select("id", { count: "exact", head: true }),
          supabase.from("supply_chain_events").select("id", { count: "exact", head: true }),
          supabase.from("products").select("id", { count: "exact", head: true }).not("blockchain_tx", "is", null),
          supabase.from("fraud_alerts").select("id", { count: "exact", head: true }).eq("is_resolved", false),
        ]);
        setStats({
          products: prodRes.count || 0,
          flagged: flagRes.count || 0,
          scans: scanRes.count || 0,
          events: eventRes.count || 0,
          alerts: alertRes.count || 0,
          anchored: anchoredRes.count || 0,
        });
      }

      // Recent products
      const { data: prods } = await supabase.from("products").select("*").order("created_at", { ascending: false }).limit(5);
      if (prods) setRecentProducts(prods);

      // Recent alerts (admin / manufacturer)
      if (role === "manufacturer" || role === "admin") {
        const { data: alerts } = await supabase
          .from("fraud_alerts")
          .select("*, products(name, product_code)")
          .eq("is_resolved", false)
          .order("created_at", { ascending: false })
          .limit(4);
        if (alerts) setRecentAlerts(alerts as unknown as AlertRow[]);
      }

      // Scan trend last 7 days
      const since7d = new Date();
      since7d.setDate(since7d.getDate() - 7);
      const { data: scanRows } = await supabase
        .from("scan_logs")
        .select("created_at")
        .gte("created_at", since7d.toISOString())
        .order("created_at", { ascending: true });
      if (scanRows) setScanChart(groupScansByDay(scanRows));
    } catch (e: unknown) {
      toast({ title: "Could not load dashboard", description: (e as Error).message, variant: "destructive" });
    }
    setLoading(false);
  }, [user?.id, role, toast]);

  useEffect(() => {
    document.title = "Dashboard — AuthentiChain";
    fetchAll();
  }, [fetchAll]);

  // ── Stat cards per role ──
  const cards = role === "supplier"
    ? [{ title: "Events Recorded", value: stats.events, icon: <Truck className="w-4 h-4" />, variant: "primary" as const }]
    : role === "customer"
    ? [
        { title: "Products Verified", value: stats.scans, icon: <Shield className="w-4 h-4" />, variant: "success" as const },
        { title: "Genuine Products", value: Math.max(0, stats.products - stats.flagged), icon: <CheckCircle2 className="w-4 h-4" />, variant: "success" as const },
      ]
    : [
        { title: "Total Products", value: stats.products, icon: <Package className="w-4 h-4" />, variant: "primary" as const },
        { title: "Flagged", value: stats.flagged, icon: <AlertTriangle className="w-4 h-4" />, variant: stats.flagged > 0 ? "destructive" as const : "default" as const },
        { title: "Total Scans", value: stats.scans, icon: <QrCode className="w-4 h-4" />, variant: "default" as const },
        { title: "SC Events", value: stats.events, icon: <Truck className="w-4 h-4" />, variant: "default" as const },
        { title: "Open Alerts", value: stats.alerts, icon: <AlertTriangle className="w-4 h-4" />, variant: stats.alerts > 0 ? "destructive" as const : "success" as const },
        { title: "On-Chain", value: stats.anchored, icon: <Link2 className="w-4 h-4" />, variant: "success" as const },
      ];

  // ── Quick actions ──
  const quickActions: { label: string; to: string; icon: React.ReactNode; color: string }[] = [];
  if (role === "manufacturer") {
    quickActions.push(
      { label: "Register Product", to: "/products", icon: <Plus className="w-4 h-4" />, color: "#71ffe8" },
      { label: "View QR Codes", to: "/qr-codes", icon: <QrCode className="w-4 h-4" />, color: "#60a5fa" },
      { label: "Supply Chain", to: "/supply-chain", icon: <Truck className="w-4 h-4" />, color: "#f9bc48" },
      { label: "View Alerts", to: "/alerts", icon: <AlertTriangle className="w-4 h-4" />, color: "#ffb4ab" },
    );
  } else if (role === "supplier") {
    quickActions.push(
      { label: "Record Event", to: "/scan-update", icon: <Send className="w-4 h-4" />, color: "#71ffe8" },
      { label: "Supply Chain", to: "/supply-chain", icon: <Truck className="w-4 h-4" />, color: "#f9bc48" },
    );
  } else if (role === "customer") {
    quickActions.push(
      { label: "Verify Product", to: "/verify", icon: <Shield className="w-4 h-4" />, color: "#71ffe8" },
      { label: "My Products", to: "/my-products", icon: <Package className="w-4 h-4" />, color: "#60a5fa" },
    );
  } else if (role === "admin") {
    quickActions.push(
      { label: "Fraud Alerts", to: "/alerts", icon: <AlertTriangle className="w-4 h-4" />, color: "#ffb4ab" },
      { label: "Audit Logs", to: "/audit-logs", icon: <Activity className="w-4 h-4" />, color: "#71ffe8" },
      { label: "Analytics", to: "/analytics", icon: <TrendingUp className="w-4 h-4" />, color: "#60a5fa" },
      { label: "Users", to: "/users", icon: <Shield className="w-4 h-4" />, color: "#f9bc48" },
    );
  }

  const severityColors: Record<string, string> = {
    low: "#60a5fa",
    medium: "#f9bc48",
    high: "#ffb4ab",
    critical: "#ef4444",
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "#71ffe8", fontFamily: "IBM Plex Mono, monospace" }}>Overview</p>
          <h1 className="font-headline text-2xl font-extrabold tracking-tight" style={{ color: "#dfe2eb" }}>Dashboard</h1>
          <p className="text-sm mt-1" style={{ color: "#849490" }}>Supply chain activity overview</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {loading
            ? Array.from({ length: cards.length || 4 }).map((_, i) => (
                <div key={i} className="bg-card rounded-xl border border-border p-4">
                  <Skeleton className="h-4 w-20 mb-3" />
                  <Skeleton className="h-7 w-12" />
                </div>
              ))
            : cards.map((c) => <StatCard key={c.title} {...c} />)}
        </div>

        {/* Quick Actions */}
        {quickActions.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "#849490", fontFamily: "IBM Plex Mono, monospace" }}>Quick Actions</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {quickActions.map((a) => (
                <Link
                  key={a.to}
                  to={a.to}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border transition-all hover:scale-[1.02] active:scale-[0.98]"
                  style={{ background: "rgba(255,255,255,0.02)" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = a.color + "40"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = ""; }}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: a.color + "15", color: a.color }}>
                    {a.icon}
                  </div>
                  <span className="text-sm font-medium" style={{ color: "#dfe2eb" }}>{a.label}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Scan Trend Chart (manufacturer/admin) */}
        {(role === "manufacturer" || role === "admin") && (
          <div style={{ background: "#161B22", border: "1px solid rgba(59,74,70,0.3)", borderRadius: "12px" }}>
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(59,74,70,0.2)" }}>
              <div>
                <h2 className="font-headline font-bold text-sm" style={{ color: "#dfe2eb" }}>Verification Scans — Last 7 Days</h2>
                <p className="text-xs mt-0.5" style={{ color: "#849490", fontFamily: "IBM Plex Mono, monospace" }}>Daily scan activity</p>
              </div>
              <QrCode className="w-4 h-4" style={{ color: "#849490" }} />
            </div>
            <div className="p-5">
              {loading ? (
                <Skeleton className="h-[160px] w-full rounded-lg" />
              ) : scanChart.length > 0 ? (
                <BarChartComponent data={scanChart} label="Scans" color="#71ffe8" height={160} />
              ) : (
                <div className="h-[160px] flex items-center justify-center text-sm" style={{ color: "#849490" }}>
                  No scan data yet
                </div>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Products */}
          {role !== "supplier" && (
            <div style={{ background: "#161B22", border: "1px solid rgba(59,74,70,0.3)", borderRadius: "12px" }}>
              <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(59,74,70,0.3)" }}>
                <h2 className="font-headline font-bold text-sm" style={{ color: "#dfe2eb" }}>Recent Products</h2>
                <Link to="/products" className="text-[10px] uppercase tracking-widest transition-colors hover:underline" style={{ color: "#71ffe8", fontFamily: "IBM Plex Mono, monospace" }}>
                  View All
                </Link>
              </div>

              {loading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
                </div>
              ) : recentProducts.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="w-12 h-12 flex items-center justify-center mx-auto mb-4 rounded-xl" style={{ background: "rgba(113,255,232,0.05)", color: "#849490" }}>
                    <Package className="w-6 h-6" />
                  </div>
                  <p className="text-sm" style={{ color: "#849490" }}>No products yet</p>
                </div>
              ) : (
                <div>
                  {recentProducts.map((p, i) => (
                    <Link
                      key={p.id}
                      to={`/products/${p.id}`}
                      className="flex items-center gap-3 px-6 py-3.5 transition-colors"
                      style={{ borderBottom: i < recentProducts.length - 1 ? "1px solid rgba(59,74,70,0.15)" : "none" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#1c2026"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    >
                      <div className="w-8 h-8 flex items-center justify-center shrink-0 rounded-lg" style={{ background: "rgba(113,255,232,0.06)", color: "#71ffe8" }}>
                        <Package className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: "#dfe2eb" }}>{p.name}</p>
                        <p className="text-xs truncate" style={{ color: "#849490", fontFamily: "IBM Plex Mono, monospace" }}>{p.product_code}</p>
                      </div>
                      <StatusBadge status={p.is_flagged ? "suspicious" : p.status} />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Recent Alerts */}
          {(role === "manufacturer" || role === "admin") && (
            <div style={{ background: "#161B22", border: "1px solid rgba(59,74,70,0.3)", borderRadius: "12px" }}>
              <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(59,74,70,0.3)" }}>
                <h2 className="font-headline font-bold text-sm" style={{ color: "#dfe2eb" }}>Active Alerts</h2>
                <Link to="/alerts" className="text-[10px] uppercase tracking-widest transition-colors hover:underline" style={{ color: "#ffb4ab", fontFamily: "IBM Plex Mono, monospace" }}>
                  View All
                </Link>
              </div>

              {loading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
                </div>
              ) : recentAlerts.length === 0 ? (
                <div className="p-12 text-center">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-3" style={{ color: "#71ffe8" }} />
                  <p className="text-sm" style={{ color: "#849490" }}>No active alerts — all clear!</p>
                </div>
              ) : (
                <div>
                  {recentAlerts.map((a, i) => (
                    <div
                      key={a.id}
                      className="flex items-start gap-3 px-6 py-3.5"
                      style={{ borderBottom: i < recentAlerts.length - 1 ? "1px solid rgba(59,74,70,0.15)" : "none" }}
                    >
                      <div
                        className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                        style={{ background: severityColors[a.severity] || "#849490" }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium capitalize" style={{ color: "#dfe2eb" }}>
                          {a.alert_type.replace(/_/g, " ")}
                          {a.products && (
                            <span className="ml-1.5 text-xs font-normal" style={{ color: "#849490" }}>
                              — {a.products.product_code}
                            </span>
                          )}
                        </p>
                        <p className="text-xs truncate mt-0.5" style={{ color: "#849490" }}>{a.description}</p>
                        <div className="flex items-center gap-1 mt-1">
                          <Clock className="w-3 h-3" style={{ color: "#7d8d88" }} />
                          <span className="text-[10px]" style={{ color: "#7d8d88", fontFamily: "IBM Plex Mono, monospace" }}>
                            {new Date(a.created_at).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase"
                        style={{ background: severityColors[a.severity] + "20", color: severityColors[a.severity] }}
                      >
                        {a.severity}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Supplier: Recent events */}
          {role === "supplier" && (
            <div style={{ background: "#161B22", border: "1px solid rgba(59,74,70,0.3)", borderRadius: "12px" }}>
              <div className="px-6 py-4" style={{ borderBottom: "1px solid rgba(59,74,70,0.3)" }}>
                <h2 className="font-headline font-bold text-sm" style={{ color: "#dfe2eb" }}>Quick Actions</h2>
              </div>
              <div className="p-5 space-y-3">
                {quickActions.map((a) => (
                  <Link
                    key={a.to}
                    to={a.to}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border transition-all"
                    style={{ background: "rgba(255,255,255,0.02)" }}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: a.color + "15", color: a.color }}>
                      {a.icon}
                    </div>
                    <span className="text-sm font-medium" style={{ color: "#dfe2eb" }}>{a.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}