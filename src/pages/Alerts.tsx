import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { useDebounce } from "@/hooks/use-debounce";
import { AlertTriangle, CheckCircle2, Search, Filter } from "lucide-react";

interface AlertRow {
  id: string;
  alert_type: string;
  severity: string;
  description: string;
  created_at: string;
  is_resolved: boolean;
  resolved_at: string | null;
  product_id: string;
  products: { name: string; product_code: string } | null;
}

const SEVERITY_STYLE: Record<string, { text: string; bg: string; border: string }> = {
  low:      { text: "#60a5fa", bg: "rgba(96,165,250,0.08)",  border: "rgba(96,165,250,0.2)" },
  medium:   { text: "#f9bc48", bg: "rgba(249,188,72,0.08)",  border: "rgba(249,188,72,0.2)" },
  high:     { text: "#ffb4ab", bg: "rgba(255,180,171,0.08)", border: "rgba(255,180,171,0.2)" },
  critical: { text: "#ef4444", bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.25)" },
};

const PAGE_SIZE = 20;

export default function Alerts() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "unresolved" | "resolved">("unresolved");
  const [severityFilter, setSeverityFilter] = useState("all");
  const debouncedSearch = useDebounce(search, 300);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const fetchAlerts = useCallback(async (targetPage: number, q: string, statusFilter: string, sevFilter: string) => {
    setLoading(true);
    const from = (targetPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("fraud_alerts")
      .select("*, products(name, product_code)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (statusFilter === "unresolved") query = query.eq("is_resolved", false);
    else if (statusFilter === "resolved") query = query.eq("is_resolved", true);

    if (sevFilter !== "all") query = query.eq("severity", sevFilter);

    // Manufacturer only sees their own products' alerts
    if (role === "manufacturer" && user?.id) {
      const { data: myProductIds } = await supabase
        .from("products")
        .select("id")
        .eq("manufacturer_id", user.id);
      if (myProductIds && myProductIds.length > 0) {
        query = query.in("product_id", myProductIds.map(p => p.id));
      }
    }

    const { data, error, count } = await query;
    if (!error && data) {
      let rows = data as unknown as AlertRow[];
      if (q) {
        const lower = q.toLowerCase();
        rows = rows.filter(a =>
          a.alert_type.includes(lower) ||
          a.description.toLowerCase().includes(lower) ||
          (a.products?.name || "").toLowerCase().includes(lower) ||
          (a.products?.product_code || "").toLowerCase().includes(lower)
        );
      }
      setAlerts(rows);
      setTotalCount(count || 0);
      setPage(targetPage);
    } else if (error) {
      toast({ title: "Could not load alerts", description: error.message, variant: "destructive" });
    }
    setLoading(false);
  }, [user?.id, role, toast]);

  useEffect(() => {
    document.title = "Alerts — AuthentiChain";
    fetchAlerts(1, debouncedSearch, filter, severityFilter);
  }, [debouncedSearch, filter, severityFilter, fetchAlerts]);

  const resolveAlert = async (id: string, productId: string) => {
    setResolving(id);
    const [alertRes, productRes] = await Promise.all([
      supabase.from("fraud_alerts").update({
        is_resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: user?.id,
      }).eq("id", id),
      supabase.from("products").update({ is_flagged: false, flag_reason: null }).eq("id", productId),
    ]);

    if (alertRes.error) {
      toast({ title: "Error", description: alertRes.error.message, variant: "destructive" });
    } else {
      if (productRes.error) {
        toast({ title: "Alert resolved", description: "Product flag could not be cleared: " + productRes.error.message, variant: "destructive" });
      } else {
        toast({ title: "Alert resolved" });
      }
      fetchAlerts(page, debouncedSearch, filter, severityFilter);
    }
    setResolving(null);
  };

  const unresolvedCount = alerts.filter(a => !a.is_resolved).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "#ffb4ab", fontFamily: "IBM Plex Mono, monospace" }}>Security</p>
            <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: "#dfe2eb" }}>Fraud Alerts</h1>
            <p className="text-sm mt-1" style={{ color: "#849490" }}>
              {unresolvedCount > 0 ? `${unresolvedCount} unresolved alert${unresolvedCount > 1 ? "s" : ""}` : "No active alerts"}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search alerts..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-[140px]">
              <Filter className="w-3.5 h-3.5 mr-1" /><SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unresolved">Unresolved</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>

          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Alerts List */}
        <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
            </div>
          ) : alerts.length === 0 ? (
            <div className="py-16 text-center">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3" style={{ color: "#71ffe8" }} />
              <p className="text-sm font-medium" style={{ color: "#dfe2eb" }}>
                {debouncedSearch || filter !== "unresolved" ? "No alerts match your filters." : "All clear! No active fraud alerts."}
              </p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-border">
                {alerts.map((a) => {
                  const s = SEVERITY_STYLE[a.severity] || SEVERITY_STYLE.medium;
                  return (
                    <div key={a.id} className="flex items-start gap-4 p-5 hover:bg-muted/20 transition-colors">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: s.bg }}>
                        {a.is_resolved
                          ? <CheckCircle2 className="w-4 h-4" style={{ color: "#71ffe8" }} />
                          : <AlertTriangle className="w-4 h-4" style={{ color: s.text }} />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <p className="text-sm font-semibold capitalize" style={{ color: "#dfe2eb" }}>
                            {a.alert_type.replace(/_/g, " ")}
                          </p>
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase" style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}>
                            {a.severity}
                          </span>
                          {a.is_resolved && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(113,255,232,0.1)", color: "#71ffe8" }}>
                              RESOLVED
                            </span>
                          )}
                        </div>
                        {a.products && (
                          <p className="text-xs mb-1" style={{ color: "#71ffe8", fontFamily: "IBM Plex Mono, monospace" }}>
                            {a.products.name} — {a.products.product_code}
                          </p>
                        )}
                        <p className="text-xs" style={{ color: "#849490" }}>{a.description}</p>
                        <p className="text-xs mt-1" style={{ color: "#5a6a66", fontFamily: "IBM Plex Mono, monospace" }}>
                          {new Date(a.created_at).toLocaleString()}
                          {a.resolved_at && ` · Resolved ${new Date(a.resolved_at).toLocaleDateString()}`}
                        </p>
                      </div>

                      {!a.is_resolved && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => resolveAlert(a.id, a.product_id)}
                          disabled={resolving === a.id}
                          className="shrink-0 text-xs"
                          style={{ color: "#71ffe8", borderColor: "rgba(113,255,232,0.3)" }}
                        >
                          {resolving === a.id ? "Resolving..." : "Resolve"}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
              <PaginationBar
                page={page}
                totalPages={totalPages}
                totalCount={totalCount}
                pageSize={PAGE_SIZE}
                onPageChange={(p) => fetchAlerts(p, debouncedSearch, filter, severityFilter)}
                isLoading={loading}
              />
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
