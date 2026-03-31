import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import type { Tables } from "@/integrations/supabase/types";

export default function Alerts() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [alerts, setAlerts] = useState<Tables<'fraud_alerts'>[]>([]);

  const fetchAlerts = async () => {
    const { data } = await supabase.from("fraud_alerts").select("*, products(name, product_code)").order("created_at", { ascending: false });
    if (data) setAlerts(data as any);
  };

  useEffect(() => {
    document.title = "Alerts — AuthentiChain";
    fetchAlerts();
    const channel = supabase
      .channel('fraud-alerts-realtime')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'fraud_alerts' },
        (payload) => setAlerts(prev => [payload.new as any, ...prev])
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const resolve = async (id: string, productId: string) => {
    await supabase.from("fraud_alerts").update({ is_resolved: true, resolved_by: user!.id, resolved_at: new Date().toISOString() }).eq("id", id);
    // Check remaining unresolved alerts for this product
    const { count } = await supabase.from("fraud_alerts").select("id", { count: "exact", head: true }).eq("product_id", productId).eq("is_resolved", false);
    if (!count || count === 0) {
      await supabase.from("products").update({ is_flagged: false, flag_reason: null }).eq("id", productId);
      toast({ title: "Alert resolved", description: "Product has been unflagged." });
    } else {
      toast({ title: "Alert resolved" });
    }
    fetchAlerts();
  };

  const severityColors: Record<string, string> = {
    low: "bg-muted text-muted-foreground",
    medium: "bg-warning/10 text-warning",
    high: "bg-destructive/10 text-destructive",
    critical: "bg-destructive text-destructive-foreground",
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{role === "admin" ? "Fraud Alerts" : "Alerts"}</h1>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/10 text-success text-xs font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            LIVE
          </span>
          <p className="text-sm text-muted-foreground mt-1 ml-auto">Monitor suspicious activities and fraud detections</p>
        </div>

        <div className="space-y-3">
          {alerts.map((a: any) => (
            <div key={a.id} className={`bg-card rounded-xl border p-5 shadow-card ${a.is_resolved ? "border-border opacity-60" : "border-destructive/20"}`}>
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${a.is_resolved ? "bg-success/10" : "bg-destructive/10"}`}>
                  {a.is_resolved ? <CheckCircle2 className="w-5 h-5 text-success" /> : <AlertTriangle className="w-5 h-5 text-destructive" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold capitalize">{a.alert_type.replace(/_/g, " ")}</p>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${severityColors[a.severity]}`}>{a.severity}</span>
                    {a.is_resolved && <StatusBadge status="genuine" />}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{a.description}</p>
                  {a.products && <p className="text-xs text-muted-foreground mt-1 font-mono">Product: {a.products.product_code}</p>}
                  <p className="text-xs text-muted-foreground mt-1">{new Date(a.created_at).toLocaleString()}</p>
                </div>
                {!a.is_resolved && role === "admin" && (
                  <Button variant="outline" size="sm" onClick={() => resolve(a.id, a.product_id)}>Resolve</Button>
                )}
              </div>
            </div>
          ))}
          {alerts.length === 0 && (
            <div className="text-center py-16 bg-card rounded-xl border border-border">
              <CheckCircle2 className="w-14 h-14 mx-auto mb-4 text-success" />
              <h3 className="text-lg font-semibold mb-1">All Systems Nominal ✅</h3>
              <p className="text-sm text-muted-foreground">No fraud alerts detected. Your supply chain is secure.</p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
