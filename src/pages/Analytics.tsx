import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatCard } from "@/components/ui/stat-card";
import { Package, Shield, AlertTriangle, QrCode, BarChart3 } from "lucide-react";

export default function Analytics() {
  const [stats, setStats] = useState({ products: 0, flagged: 0, scans: 0, events: 0, genuine: 0 });

  useEffect(() => {
    document.title = "Analytics — AuthentiChain";
    const fetch = async () => {
      const [p, f, s, e] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("is_flagged", true),
        supabase.from("scan_logs").select("id", { count: "exact", head: true }),
        supabase.from("supply_chain_events").select("id", { count: "exact", head: true }),
      ]);
      const total = p.count || 0;
      const flagged = f.count || 0;
      setStats({ products: total, flagged, scans: s.count || 0, events: e.count || 0, genuine: total - flagged });
    };
    fetch();
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">System-wide metrics and insights</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard title="Total Products" value={stats.products} icon={<Package className="w-5 h-5" />} variant="primary" />
          <StatCard title="Genuine Products" value={stats.genuine} icon={<Shield className="w-5 h-5" />} variant="success" />
          <StatCard title="Suspicious Products" value={stats.flagged} icon={<AlertTriangle className="w-5 h-5" />} variant="destructive" />
          <StatCard title="Total Scans" value={stats.scans} icon={<QrCode className="w-5 h-5" />} />
          <StatCard title="Supply Chain Events" value={stats.events} icon={<BarChart3 className="w-5 h-5" />} />
          <StatCard title="Verification Rate" value={stats.products > 0 ? `${Math.round((stats.genuine / stats.products) * 100)}%` : "N/A"} icon={<Shield className="w-5 h-5" />} variant="success" />
        </div>
      </div>
    </DashboardLayout>
  );
}
