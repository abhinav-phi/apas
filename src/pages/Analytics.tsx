import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatCard } from "@/components/ui/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { TimeSeriesChart, BarChartComponent, CategoryPieChart } from "@/components/charts";
import { Package, Shield, AlertTriangle, QrCode, BarChart3, TrendingUp, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type DateRange = "7d" | "30d" | "90d" | "all";

interface TimeDataPoint {
  date: string;
  value: number;
}

interface CategoryDataPoint {
  name: string;
  value: number;
}

function getDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function groupByDate(rows: { created_at: string }[]): TimeDataPoint[] {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const d = new Date(row.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date: formatDateLabel(date), value }));
}

export default function Analytics() {
  const { toast } = useToast();
  const [stats, setStats] = useState({ products: 0, flagged: 0, scans: 0, events: 0, genuine: 0, alerts: 0 });
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [loading, setLoading] = useState(true);

  const [productsOverTime, setProductsOverTime] = useState<TimeDataPoint[]>([]);
  const [scansPerDay, setScansPerDay] = useState<TimeDataPoint[]>([]);
  const [alertsOverTime, setAlertsOverTime] = useState<TimeDataPoint[]>([]);
  const [productsByCategory, setProductsByCategory] = useState<CategoryDataPoint[]>([]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const daysMap: Record<DateRange, number> = { "7d": 7, "30d": 30, "90d": 90, "all": 3650 };
      const since = getDaysAgo(daysMap[dateRange]);
      const sinceDay = since.slice(0, 10);
      const todayKey = new Date().toISOString().slice(0, 10);

      // Stats — estimated counts on high-volume tables (Rules R25)
      const [p, f, s, e, al] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("is_flagged", true),
        supabase.from("scan_logs").select("id", { count: "estimated", head: true }),
        supabase.from("supply_chain_events").select("id", { count: "estimated", head: true }),
        supabase.from("fraud_alerts").select("id", { count: "exact", head: true }).eq("is_resolved", false),
      ]);

      const total = p.count || 0;
      const flagged = f.count || 0;
      setStats({
        products: total,
        flagged,
        scans: s.count || 0,
        events: e.count || 0,
        genuine: total - flagged,
        alerts: al.count || 0,
      });

      // Time series — long ranges read the nightly daily_stats rollup
      // (v8) instead of pulling full scan_logs/fraud_alerts history
      // into the browser (ImplementationPlan 2.1 "Daily Stats Rollup").
      if (dateRange === "all" || dateRange === "90d") {
        const { data: rollup, error: rollupError } = await supabase
          .from("daily_stats")
          .select("day, products_created, scans, alerts")
          .gte("day", sinceDay)
          .order("day", { ascending: true });
        if (rollupError) throw rollupError;

        const past = (rollup || []).filter((r) => r.day < todayKey);

        // Today is a live partial — rollup refreshes nightly at 00:10 UTC
        const [tP, tS, tA] = await Promise.all([
          supabase.from("products").select("id", { count: "exact", head: true }).gte("created_at", `${todayKey}T00:00:00Z`),
          supabase.from("scan_logs").select("id", { count: "estimated", head: true }).gte("created_at", `${todayKey}T00:00:00Z`),
          supabase.from("fraud_alerts").select("id", { count: "exact", head: true }).gte("created_at", `${todayKey}T00:00:00Z`),
        ]);
        const withToday = [
          ...past,
          { day: todayKey, products_created: tP.count || 0, scans: tS.count || 0, alerts: tA.count || 0 },
        ];

        setProductsOverTime(withToday.map((r) => ({ date: formatDateLabel(r.day), value: r.products_created })));
        setScansPerDay(withToday.map((r) => ({ date: formatDateLabel(r.day), value: r.scans })));
        setAlertsOverTime(withToday.map((r) => ({ date: formatDateLabel(r.day), value: r.alerts })));
      } else {
        const [prodRows, scanRows, alertRows] = await Promise.all([
          supabase.from("products").select("created_at").gte("created_at", since).order("created_at", { ascending: true }),
          supabase.from("scan_logs").select("created_at").gte("created_at", since).order("created_at", { ascending: true }),
          supabase.from("fraud_alerts").select("created_at").gte("created_at", since).order("created_at", { ascending: true }),
        ]);
        setProductsOverTime(groupByDate(prodRows.data || []));
        setScansPerDay(groupByDate(scanRows.data || []));
        setAlertsOverTime(groupByDate(alertRows.data || []));
      }

      // Category distribution — whole selected window. The products table is
      // bounded (≤ low-tens-of-thousands of rows) so pulling just the `category`
      // column for the window is cheap, unlike scan_logs/events above.
      const { data: categoryRows, error: catError } = await supabase
        .from("products")
        .select("category")
        .gte("created_at", since);
      if (catError) throw catError;

      const catCounts: Record<string, number> = {};
      for (const row of categoryRows) {
        const cat = (row.category || "general").replace(/_/g, " ");
        catCounts[cat] = (catCounts[cat] || 0) + 1;
      }
      setProductsByCategory(
        Object.entries(catCounts)
          .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }))
          .sort((a, b) => b.value - a.value)
      );

    } catch (err: unknown) {
      toast({ title: "Could not load analytics", description: (err as Error).message, variant: "destructive" });
    }
    setLoading(false);
  }, [dateRange, toast]);

  useEffect(() => {
    document.title = "Analytics — AuthentiChain";
    fetchAll();
  }, [fetchAll]);

  const exportCSV = async () => {
    try {
      const { data } = await supabase
        .from("products")
        .select("name, brand, category, status, trust_score, is_flagged, created_at")
        .order("created_at", { ascending: false });

      if (!data || data.length === 0) {
        toast({ title: "No data to export" });
        return;
      }

      const header = "Name,Brand,Category,Status,Trust Score,Is Flagged,Created At";
      const rows = data.map(
        (p) =>
          `"${p.name}","${p.brand}","${p.category}","${p.status}","${p.trust_score}","${p.is_flagged}","${p.created_at}"`
      );
      const csv = [header, ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.download = `analytics-${new Date().toISOString().split("T")[0]}.csv`;
      a.href = url;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Analytics exported", description: "CSV downloaded successfully." });
    } catch (err: unknown) {
      toast({ title: "Export failed", description: (err as Error).message, variant: "destructive" });
    }
  };

  const verificationRate =
    stats.products > 0 ? `${Math.round((stats.genuine / stats.products) * 100)}%` : "N/A";

  const chartCard = (title: string, subtitle: string, children: React.ReactNode) => (
    <div className="bg-card rounded-xl border border-border shadow-card p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold" style={{ color: "#dfe2eb" }}>
          {title}
        </h3>
        <p className="text-xs mt-0.5" style={{ color: "#849490", fontFamily: "IBM Plex Mono, monospace" }}>
          {subtitle}
        </p>
      </div>
      {loading ? <Skeleton className="w-full h-[200px] rounded-lg" /> : children}
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "#71ffe8", fontFamily: "IBM Plex Mono, monospace" }}>
              Analytics
            </p>
            <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: "#dfe2eb" }}>
              Metrics & Insights
            </h1>
            <p className="text-sm mt-1" style={{ color: "#849490" }}>
              System-wide analytics and supply chain intelligence
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Date range selector */}
            <div className="flex rounded-lg overflow-hidden border border-border">
              {(["7d", "30d", "90d", "all"] as DateRange[]).map((range) => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  className="px-3 py-1.5 text-xs transition-colors"
                  style={{
                    fontFamily: "IBM Plex Mono, monospace",
                    background: dateRange === range ? "rgba(113,255,232,0.15)" : "transparent",
                    color: dateRange === range ? "#71ffe8" : "#849490",
                    borderRight: range !== "all" ? "1px solid rgba(113,255,232,0.1)" : "none",
                  }}
                >
                  {range === "all" ? "ALL" : range.toUpperCase()}
                </button>
              ))}
            </div>

            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="w-4 h-4 mr-1" /> Export CSV
            </Button>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-card rounded-xl border border-border p-5">
                  <Skeleton className="h-4 w-24 mb-3" />
                  <Skeleton className="h-8 w-16" />
                </div>
              ))
            : [
                { title: "Total Products", value: stats.products, icon: <Package className="w-4 h-4" />, variant: "primary" as const },
                { title: "Genuine Products", value: stats.genuine, icon: <Shield className="w-4 h-4" />, variant: "success" as const },
                { title: "Flagged", value: stats.flagged, icon: <AlertTriangle className="w-4 h-4" />, variant: stats.flagged > 0 ? "destructive" as const : "default" as const },
                { title: "Total Scans", value: stats.scans, icon: <QrCode className="w-4 h-4" />, variant: "default" as const },
                { title: "SC Events", value: stats.events, icon: <TrendingUp className="w-4 h-4" />, variant: "default" as const },
                { title: "Verification Rate", value: verificationRate, icon: <BarChart3 className="w-4 h-4" />, variant: "success" as const },
              ].map((c) => (
                <StatCard key={c.title} {...c} />
              ))}
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {chartCard(
            "Products Registered Over Time",
            `Registrations in selected period`,
            <TimeSeriesChart data={productsOverTime} label="Products" height={200} />
          )}
          {chartCard(
            "Verification Scans Per Day",
            "Daily scan activity",
            <BarChartComponent data={scansPerDay} label="Scans" color="#60a5fa" height={200} />
          )}
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {chartCard(
            "Products by Category",
            "Distribution across product categories",
            <CategoryPieChart data={productsByCategory} height={220} />
          )}
          {chartCard(
            "Fraud Alerts Over Time",
            "Suspicious activity trend",
            <TimeSeriesChart data={alertsOverTime} color="#ffb4ab" label="Alerts" height={200} />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
