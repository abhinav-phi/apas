import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Package, Shield, ExternalLink, RefreshCw, Clock, QrCode } from "lucide-react";

interface ProductWithScan {
  id: string;
  name: string;
  brand: string;
  product_code: string;
  is_flagged: boolean;
  status: string;
  trust_score: number;
  category: string;
  created_at: string;
  last_scanned?: string;
  scan_count: number;
}

export default function MyProducts() {
  const { user } = useAuth();
  const [products, setProducts] = useState<ProductWithScan[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProducts = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Get scan logs for this user, with product info
    const { data: scanLogs } = await supabase
      .from("scan_logs")
      .select("product_id, created_at, products(id, name, brand, product_code, is_flagged, status, trust_score, category, created_at)")
      .eq("scanner_id", user.id)
      .eq("is_suspicious", false)
      .order("created_at", { ascending: false });

    if (!scanLogs) { setLoading(false); return; }

    // Aggregate by product
    const productMap = new Map<string, ProductWithScan>();
    for (const log of scanLogs) {
      const p = log.products as unknown as ProductWithScan;
      if (!p) continue;
      const existing = productMap.get(p.id);
      if (!existing) {
        productMap.set(p.id, {
          ...p,
          last_scanned: log.created_at,
          scan_count: 1,
        });
      } else {
        existing.scan_count++;
      }
    }

    // Also include products transferred to this user
    const { data: transfers } = await supabase
      .from("ownership_transfers")
      .select("products(id, name, brand, product_code, is_flagged, status, trust_score, category, created_at)")
      .eq("to_user_id", user.id);

    if (transfers) {
      for (const t of transfers) {
        const p = t.products as unknown as ProductWithScan;
        if (!p || productMap.has(p.id)) continue;
        productMap.set(p.id, { ...p, scan_count: 0 });
      }
    }

    setProducts(Array.from(productMap.values()));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    document.title = "My Products — AuthentiChain";
    fetchProducts();
  }, [fetchProducts]);

  const trustColor = (score: number) => score >= 80 ? "#71ffe8" : score >= 50 ? "#f9bc48" : "#ffb4ab";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "#71ffe8", fontFamily: "IBM Plex Mono, monospace" }}>Customer</p>
            <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: "#dfe2eb" }}>My Products</h1>
            <p className="text-sm mt-1" style={{ color: "#849490" }}>Products you've verified or received</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchProducts}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card rounded-xl border border-border p-5">
                <Skeleton className="h-5 w-40 mb-3" />
                <Skeleton className="h-4 w-28 mb-4" />
                <Skeleton className="h-2 w-full mb-4" />
                <Skeleton className="h-8 w-full" />
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16 bg-card rounded-xl border border-border">
            <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center rounded-2xl" style={{ background: "rgba(113,255,232,0.06)" }}>
              <Package className="w-8 h-8" style={{ color: "rgba(113,255,232,0.4)" }} />
            </div>
            <h2 className="font-semibold mb-1" style={{ color: "#dfe2eb" }}>No products yet</h2>
            <p className="text-sm mb-4" style={{ color: "#849490" }}>Scan a product QR code to verify and track it here</p>
            <Link to="/verify">
              <Button size="sm">
                <Shield className="w-4 h-4 mr-1.5" /> Verify a Product
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <p className="text-xs" style={{ color: "#849490", fontFamily: "IBM Plex Mono, monospace" }}>
              {products.length} product{products.length !== 1 ? "s" : ""} in your collection
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {products.map((p) => {
                const tc = trustColor(p.trust_score ?? 100);
                return (
                  <div key={p.id} className="bg-card rounded-xl border border-border p-5 shadow-card space-y-4">
                    {/* Header */}
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(113,255,232,0.08)", color: "#71ffe8" }}>
                        <Shield className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate" style={{ color: "#dfe2eb" }}>{p.name}</p>
                        <p className="text-xs" style={{ color: "#849490" }}>{p.brand} · <span style={{ fontFamily: "IBM Plex Mono, monospace" }}>{p.product_code}</span></p>
                      </div>
                      <StatusBadge status={p.is_flagged ? "suspicious" : p.status} />
                    </div>

                    {/* Trust Score */}
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-xs" style={{ color: "#849490" }}>Trust Score</span>
                        <span className="text-xs font-bold" style={{ color: tc }}>{p.trust_score ?? 100}/100</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div className="h-full rounded-full" style={{ width: `${p.trust_score ?? 100}%`, background: tc }} />
                      </div>
                    </div>

                    {/* Meta */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="mb-0.5" style={{ color: "#5a6a66" }}>Category</p>
                        <p className="capitalize" style={{ color: "#849490" }}>{p.category || "—"}</p>
                      </div>
                      <div>
                        <p className="mb-0.5" style={{ color: "#5a6a66" }}>Scans</p>
                        <p className="flex items-center gap-1" style={{ color: "#849490" }}>
                          <QrCode className="w-3 h-3" /> {p.scan_count}
                        </p>
                      </div>
                      {p.last_scanned && (
                        <div className="col-span-2">
                          <p className="mb-0.5" style={{ color: "#5a6a66" }}>Last Scanned</p>
                          <p className="flex items-center gap-1" style={{ color: "#849490", fontFamily: "IBM Plex Mono, monospace" }}>
                            <Clock className="w-3 h-3" /> {new Date(p.last_scanned).toLocaleString()}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                      <Link to={`/verify?code=${p.product_code}`} className="flex-1">
                        <Button variant="outline" size="sm" className="w-full gap-1.5">
                          <Shield className="w-3.5 h-3.5" /> Re-Verify
                        </Button>
                      </Link>
                      <Link
                        to={`/verify?code=${p.product_code}`}
                        target="_blank"
                        className="w-9 flex items-center justify-center rounded-md border border-border hover:bg-muted/30 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" style={{ color: "#849490" }} />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
