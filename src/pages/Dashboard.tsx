import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Package, Shield, AlertTriangle, QrCode, Truck, CheckCircle2, Link2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

export default function Dashboard() {
  const { user, role } = useAuth();
  const [stats, setStats] = useState({ products: 0, flagged: 0, scans: 0, events: 0, alerts: 0, anchored: 0 });
  const [recentProducts, setRecentProducts] = useState<Tables<'products'>[]>([]);

  useEffect(() => {
    document.title = "Dashboard — AuthentiChain";
    const fetchStats = async () => {
      if (role === "supplier") {
        const { count } = await supabase.from("supply_chain_events").select("id", { count: "exact", head: true }).eq("actor_id", user!.id);
        setStats({ products: 0, flagged: 0, scans: 0, events: count || 0, alerts: 0, anchored: 0 });
      } else {
        const [prodRes, flagRes, scanRes, eventRes, anchoredRes] = await Promise.all([
          supabase.from("products").select("id", { count: "exact", head: true }),
          supabase.from("products").select("id", { count: "exact", head: true }).eq("is_flagged", true),
          supabase.from("scan_logs").select("id", { count: "exact", head: true }),
          supabase.from("supply_chain_events").select("id", { count: "exact", head: true }),
          supabase.from("products").select("id", { count: "exact", head: true }).not("blockchain_tx", "is", null),
        ]);
        setStats({
          products: prodRes.count || 0,
          flagged: flagRes.count || 0,
          scans: scanRes.count || 0,
          events: eventRes.count || 0,
          alerts: 0,
          anchored: anchoredRes.count || 0,
        });
      }
      const { data: prods } = await supabase.from("products").select("*").order("created_at", { ascending: false }).limit(5);
      if (prods) setRecentProducts(prods);
    };
    fetchStats();
  }, []);

  const statCards = {
    manufacturer: [
      { title: "Total Products", value: stats.products, icon: <Package className="w-4 h-4" />, variant: "primary" as const },
      { title: "Flagged Products", value: stats.flagged, icon: <AlertTriangle className="w-4 h-4" />, variant: stats.flagged > 0 ? "destructive" as const : "default" as const },
      { title: "Total Scans", value: stats.scans, icon: <QrCode className="w-4 h-4" />, variant: "default" as const },
      { title: "On-Chain", value: stats.anchored, icon: <Link2 className="w-4 h-4" />, variant: "success" as const },
    ],
    supplier: [
      { title: "Events Recorded", value: stats.events, icon: <Truck className="w-4 h-4" />, variant: "primary" as const },
    ],
    customer: [
      { title: "Products Verified", value: stats.scans, icon: <Shield className="w-4 h-4" />, variant: "success" as const },
      { title: "Genuine Products", value: stats.products - stats.flagged, icon: <CheckCircle2 className="w-4 h-4" />, variant: "success" as const },
    ],
    admin: [
      { title: "Total Products", value: stats.products, icon: <Package className="w-4 h-4" />, variant: "primary" as const },
      { title: "Flagged Products", value: stats.flagged, icon: <AlertTriangle className="w-4 h-4" />, variant: stats.flagged > 0 ? "destructive" as const : "default" as const },
      { title: "Total Scans", value: stats.scans, icon: <QrCode className="w-4 h-4" />, variant: "default" as const },
      { title: "Supply Chain Events", value: stats.events, icon: <Truck className="w-4 h-4" />, variant: "default" as const },
    ],
  };

  const cards = role ? statCards[role] || [] : [];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Page header */}
        <div>
          <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: '#71ffe8', fontFamily: 'IBM Plex Mono, monospace' }}>
            Overview
          </p>
          <h1 className="font-headline text-2xl font-extrabold tracking-tight" style={{ color: '#dfe2eb' }}>Dashboard</h1>
          <p className="text-sm mt-1" style={{ color: '#849490', fontFamily: 'Geist Sans, sans-serif' }}>
            Supply chain activity overview
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map(c => (
            <StatCard key={c.title} {...c} />
          ))}
        </div>

        {/* Recent Products */}
        {role !== "supplier" && (
          <div style={{ background: '#161B22', border: '1px solid rgba(59,74,70,0.3)' }}>
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(59,74,70,0.3)' }}>
              <h2 className="font-headline font-bold text-base" style={{ color: '#dfe2eb' }}>Recent Products</h2>
              <span className="text-[10px] uppercase tracking-widest" style={{ color: '#849490', fontFamily: 'IBM Plex Mono, monospace' }}>
                Latest {recentProducts.length}
              </span>
            </div>

            {recentProducts.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-12 h-12 flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(113,255,232,0.05)', color: '#849490' }}>
                  <Package className="w-6 h-6" />
                </div>
                <p className="text-sm" style={{ color: '#849490', fontFamily: 'Geist Sans, sans-serif' }}>No products yet</p>
                {role === "manufacturer" && (
                  <p className="text-xs mt-1" style={{ color: 'rgba(132,148,144,0.6)', fontFamily: 'IBM Plex Mono, monospace' }}>
                    Register your first product to get started
                  </p>
                )}
              </div>
            ) : (
              <div>
                {/* Table header */}
                <div className="grid grid-cols-12 gap-4 px-6 py-3" style={{ background: '#0a0e14', borderBottom: '1px solid rgba(59,74,70,0.2)' }}>
                  {["Product", "Code", "Status"].map(h => (
                    <div key={h} className={`${h === "Product" ? "col-span-6" : h === "Code" ? "col-span-3" : "col-span-3"} text-[10px] uppercase tracking-widest font-bold`} style={{ color: '#849490', fontFamily: 'IBM Plex Mono, monospace' }}>
                      {h}
                    </div>
                  ))}
                </div>
                {recentProducts.map(p => (
                  <div
                    key={p.id}
                    className="grid grid-cols-12 gap-4 items-center px-6 py-4 transition-colors"
                    style={{ borderBottom: '1px solid rgba(59,74,70,0.15)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#1c2026'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <div className="col-span-6 flex items-center gap-3">
                      <div className="w-8 h-8 flex items-center justify-center shrink-0" style={{ background: 'rgba(113,255,232,0.06)', color: '#71ffe8' }}>
                        <Package className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium" style={{ color: '#dfe2eb', fontFamily: 'Geist Sans, sans-serif' }}>{p.name}</p>
                        <p className="text-xs" style={{ color: '#849490', fontFamily: 'Geist Sans, sans-serif' }}>{p.brand}</p>
                      </div>
                    </div>
                    <div className="col-span-3">
                      <span className="text-xs" style={{ color: '#849490', fontFamily: 'IBM Plex Mono, monospace' }}>{p.product_code}</span>
                    </div>
                    <div className="col-span-3">
                      <StatusBadge status={p.is_flagged ? "suspicious" : p.status} />
                    </div>
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