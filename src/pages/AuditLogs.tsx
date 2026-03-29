import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

interface AuditEvent {
  id: string;
  created_at: string;
  event_type: string;
  location: string | null;
  event_hash: string;
  actor_id: string;
  products: { name: string; product_code: string } | null;
}

export default function AuditLogs() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Audit Logs — AuthentiChain";
    supabase.from("supply_chain_events").select("*, products(name, product_code)").order("created_at", { ascending: false }).limit(100).then(({ data }) => {
      if (data) setEvents(data as any);
      setLoading(false);
    });
  }, []);

  const exportCSV = () => {
    const header = "Timestamp,Product Name,Product Code,Event Type,Location,Actor,Hash";
    const rows = events.map(e =>
      `"${new Date(e.created_at).toISOString()}","${e.products?.name || ""}","${e.products?.product_code || ""}","${e.event_type}","${e.location || ""}","${e.actor_id}","${e.event_hash}"`
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.download = `audit-log-${new Date().toISOString().split("T")[0]}.csv`;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold">Audit Logs</h1>
            <p className="text-sm text-muted-foreground mt-1">Complete log of all system activities</p>
          </div>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={events.length === 0}>
            <Download className="w-4 h-4 mr-1" /> Export CSV
          </Button>
        </div>

        <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Timestamp</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Product</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Event</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Location</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-8 w-32" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                    </tr>
                  ))
                ) : (
                  <>
                    {events.map((e) => (
                      <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium">{e.products?.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{e.products?.product_code}</p>
                        </td>
                        <td className="px-4 py-3 text-sm capitalize">{e.event_type.replace(/_/g, " ")}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{e.location || "—"}</td>
                        <td className="px-4 py-3 text-xs font-mono text-muted-foreground/50 truncate max-w-[120px]">{e.event_hash.substring(0, 16)}...</td>
                      </tr>
                    ))}
                    {events.length === 0 && (
                      <tr><td colSpan={5} className="text-center py-8 text-muted-foreground text-sm">No audit logs yet</td></tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
