import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { useDebounce } from "@/hooks/use-debounce";

interface AuditEvent {
  id: string;
  created_at: string;
  event_type: string;
  location: string | null;
  event_hash: string;
  actor_id: string;
  products: { name: string; product_code: string } | null;
}

const EVENT_COLORS: Record<string, string> = {
  manufactured: "text-blue-400",
  shipped: "text-amber-400",
  in_transit: "text-amber-300",
  received: "text-emerald-400",
  delivered: "text-teal-400",
  sold: "text-purple-400",
  recalled: "text-red-400",
};

const PAGE_SIZE = 25;

export default function AuditLogs() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const { toast } = useToast();

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const fetchLogs = useCallback(async (targetPage: number, q: string) => {
    setLoading(true);
    const from = (targetPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("supply_chain_events")
      .select("*, products(name, product_code)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    const { data, error, count } = await query;

    if (!error && data) {
      // Filter client-side only when search is active
      // (Supabase FK text search requires a special setup — we filter after fetch)
      const filtered = q
        ? (data as unknown as AuditEvent[]).filter((e) =>
            e.event_type.includes(q.toLowerCase()) ||
            (e.products?.name || "").toLowerCase().includes(q.toLowerCase()) ||
            (e.products?.product_code || "").toLowerCase().includes(q.toLowerCase()) ||
            (e.location || "").toLowerCase().includes(q.toLowerCase())
          )
        : (data as unknown as AuditEvent[]);

      setEvents(filtered);
      setTotalCount(count || 0);
      setPage(targetPage);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    document.title = "Audit Logs — AuthentiChain";
    fetchLogs(1, debouncedSearch);
  }, [debouncedSearch, fetchLogs]);

  const exportCSV = async () => {
    try {
      const { data } = await supabase
        .from("supply_chain_events")
        .select("*, products(name, product_code)")
        .order("created_at", { ascending: false });

      if (!data || data.length === 0) {
        toast({ title: "No data to export" });
        return;
      }

      const header = "Timestamp,Product Name,Product Code,Event Type,Location,Actor,Hash";
      const rows = (data as unknown as AuditEvent[]).map(
        (e) =>
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
      toast({ title: "Export complete", description: "CSV downloaded successfully." });
    } catch (error: unknown) {
      toast({ title: "Export failed", description: (error as Error).message, variant: "destructive" });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "#71ffe8", fontFamily: "IBM Plex Mono, monospace" }}>
              Audit
            </p>
            <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: "#dfe2eb" }}>Audit Logs</h1>
            <p className="text-sm mt-1" style={{ color: "#849490" }}>
              Complete, immutable log of all supply chain events
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={events.length === 0}>
            <Download className="w-4 h-4 mr-1" /> Export CSV
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by product, event type, location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border" style={{ background: "#0a0e14" }}>
                  {["Timestamp", "Product", "Event", "Location", "Hash (truncated)"].map((h) => (
                    <th key={h} className="text-left text-xs font-medium px-4 py-3" style={{ color: "#849490", fontFamily: "IBM Plex Mono, monospace" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
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
                        <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "#849490", fontFamily: "IBM Plex Mono, monospace" }}>
                          {new Date(e.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium" style={{ color: "#dfe2eb" }}>{e.products?.name || "—"}</p>
                          <p className="text-xs font-mono" style={{ color: "#849490" }}>{e.products?.product_code || "—"}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-sm font-medium capitalize ${EVENT_COLORS[e.event_type] || "text-foreground"}`}
                          >
                            {e.event_type.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm" style={{ color: "#849490" }}>{e.location || "—"}</td>
                        <td className="px-4 py-3 text-xs font-mono truncate max-w-[120px]" style={{ color: "rgba(132,148,144,0.5)" }}>
                          {e.event_hash.substring(0, 16)}...
                        </td>
                      </tr>
                    ))}
                    {events.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center py-12 text-sm" style={{ color: "#849490" }}>
                          {debouncedSearch ? "No events matching your search." : "No audit logs yet."}
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
          <PaginationBar
            page={page}
            totalPages={totalPages}
            totalCount={totalCount}
            pageSize={PAGE_SIZE}
            onPageChange={(p) => fetchLogs(p, debouncedSearch)}
            isLoading={loading}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
