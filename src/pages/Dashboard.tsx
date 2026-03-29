import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Package, Shield, AlertTriangle, QrCode, Truck, CheckCircle2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

export default function Dashboard() {
  const { user, role } = useAuth();
  const [stats, setStats] = useState({ products: 0, flagged: 0, scans: 0, events: 0, alerts: 0 });
  const [recentProducts, setRecentProducts] = useState<Tables<'products'>[]>([]);

  useEffect(() => {
    document.title = "Dashboard — AuthentiChain";
    const fetchStats = async () => {
      if (role === "supplier") {
        const { count } = await supabase.from("supply_chain_events").select("id", { count: "exact", head: true }).eq("actor_id", user!.id);
        setStats({ products: 0, flagged: 0, scans: 0, events: count || 0, alerts: 0 });
      } else {
        const [prodRes, flagRes, scanRes, eventRes] = await Promise.all([
          supabase.from("products").select("id", { count: "exact", head: true }),
          supabase.from("products").select("id", { count: "exact", head: true }).eq("is_flagged", true),
          supabase.from("scan_logs").select("id", { count: "exact", head: true }),
          supabase.from("supply_chain_events").select("id", { count: "exact", head: true }),
        ]);
        setStats({
          products: prodRes.count || 0,
          flagged: flagRes.count || 0,
          scans: scanRes.count || 0,
          events: eventRes.count || 0,
          alerts: 0,
        });
      }

      const { data: prods } = await supabase.from("products").select("*").order("created_at", { ascending: false }).limit(5);
      if (prods) setRecentProducts(prods);
    };
    fetchStats();
  }, []);

  const statCards = {
    manufacturer: [
      { title: "Total Products", value: stats.products, icon: <Package className="w-5 h-5" />, variant: "primary" as const },
      { title: "Flagged Products", value: stats.flagged, icon: <AlertTriangle className="w-5 h-5" />, variant: stats.flagged > 0 ? "destructive" as const : "default" as const },
      { title: "Total Scans", value: stats.scans, icon: <QrCode className="w-5 h-5" />, variant: "default" as const },
      { title: "Supply Chain Events", value: stats.events, icon: <Truck className="w-5 h-5" />, variant: "default" as const },
    ],
    supplier: [
      { title: "Events Recorded", value: stats.events, icon: <Truck className="w-5 h-5" />, variant: "primary" as const },
    ],
    customer: [
      { title: "Products Verified", value: stats.scans, icon: <Shield className="w-5 h-5" />, variant: "success" as const },
      { title: "Genuine Products", value: stats.products - stats.flagged, icon: <CheckCircle2 className="w-5 h-5" />, variant: "success" as const },
    ],
    admin: [
      { title: "Total Products", value: stats.products, icon: <Package className="w-5 h-5" />, variant: "primary" as const },
      { title: "Flagged Products", value: stats.flagged, icon: <AlertTriangle className="w-5 h-5" />, variant: stats.flagged > 0 ? "destructive" as const : "default" as const },
      { title: "Total Scans", value: stats.scans, icon: <QrCode className="w-5 h-5" />, variant: "default" as const },
      { title: "Supply Chain Events", value: stats.events, icon: <Truck className="w-5 h-5" />, variant: "default" as const },
    ],
  };

  const cards = role ? statCards[role] || [] : [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Overview of your supply chain activity</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((c) => (
            <StatCard key={c.title} {...c} />
          ))}
        </div>

        {role !== "supplier" && (
          <div className="bg-card rounded-xl border border-border shadow-card">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold">Recent Products</h2>
            </div>
            {recentProducts.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No products yet. {role === "manufacturer" && "Start by registering a product."}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentProducts.map((p) => (
                  <div key={p.id} className="flex items-center gap-4 px-5 py-3">
                    <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
                      <Package className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{p.product_code}</p>
                    </div>
                    <StatusBadge status={p.is_flagged ? "suspicious" : p.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
