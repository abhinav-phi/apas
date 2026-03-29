import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SupplyChainTimeline } from "@/components/ui/timeline";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Search, CheckCircle2, XCircle, Package, Printer, ShieldCheck, ShieldAlert } from "lucide-react";
import { motion } from "framer-motion";
import { generateEventHash } from "@/lib/hash";

function verifyHashChain(events: any[]): boolean {
  for (const event of events) {
    const recomputed = generateEventHash({
      productId: event.product_id,
      eventType: event.event_type,
      actorId: event.actor_id,
      timestamp: event.created_at,
      previousHash: event.previous_event_hash,
    });
    if (recomputed !== event.event_hash) return false;
  }
  return true;
}

function computeTrustScore(product: any, alertCount: number, scanCount: number): number {
  let score = 100;
  score -= alertCount * 20;
  if (product.is_flagged) score -= 30;
  if (product.status !== "active") score -= 20;
  if (scanCount > 50) score -= 10;
  return Math.max(0, score);
}

export default function Verify() {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(decodeURIComponent(searchParams.get("code") || ""));
  const [product, setProduct] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [scanCount, setScanCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [hashChainValid, setHashChainValid] = useState<boolean | null>(null);
  const [trustScore, setTrustScore] = useState(100);
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    document.title = "Verify — AuthentiChain";
    const code = searchParams.get("code");
    if (code) handleVerify(decodeURIComponent(code));
  }, []);

  const handleVerify = async (code?: string) => {
    const q = code || query;
    if (!q.trim()) return;
    setLoading(true);
    setSearched(true);
    setHashChainValid(null);

    // Try by qr_data or product_code
    let { data: prod } = await supabase.from("products").select("*").eq("qr_data", q).maybeSingle();
    if (!prod) {
      const res = await supabase.from("products").select("*").eq("product_code", q).maybeSingle();
      prod = res.data;
    }
    if (!prod && q.includes("::")) {
      const extractedCode = q.split("::")[0];
      const res = await supabase.from("products").select("*").eq("product_code", extractedCode).maybeSingle();
      prod = res.data;
    }

    if (prod) {
      setProduct(prod);
      // Fetch events
      const { data: evts } = await supabase.from("supply_chain_events").select("*").eq("product_id", prod.id).order("created_at", { ascending: true });
      const eventsList = evts || [];
      setEvents(eventsList);

      // Verify hash chain
      if (eventsList.length > 0) {
        setHashChainValid(verifyHashChain(eventsList));
      }

      // Log scan via RPC
      // const { data: scanResult } = await (supabase.rpc as any)("log_product_scan", {
      //   p_product_id: prod.id,
      //   p_user_agent: navigator.userAgent,
      // });
            const { data: scanResult, error } = await supabase.rpc(
        "log_product_scan",
        {
          p_product_id: prod.id,
          p_user_agent: navigator.userAgent,
        }
      );

      if (error) {
        console.error("RPC Error:", error);
      }
      const currentScanCount = (scanResult as any)?.scan_count || 0;
      setScanCount(currentScanCount);

      // Get alert count for trust score
      const { count: alerts } = await supabase.from("fraud_alerts").select("id", { count: "exact", head: true }).eq("product_id", prod.id).eq("is_resolved", false);
      const ac = alerts || 0;
      setAlertCount(ac);
      setTrustScore(computeTrustScore(prod, ac, currentScanCount));
    } else {
      setProduct(null);
      setEvents([]);
    }
    setLoading(false);
  };

  const isGenuine = product && !product.is_flagged && product.status === "active";

  const trustLabel = trustScore >= 80 ? "High Trust" : trustScore >= 50 ? "Medium Trust" : "Low Trust";
  const trustColor = trustScore >= 80 ? "text-success" : trustScore >= 50 ? "text-warning" : "text-destructive";
  const trustBg = trustScore >= 80 ? "bg-success" : trustScore >= 50 ? "bg-warning" : "bg-destructive";

  return (
    <div className="min-h-screen bg-background">
      {/* Print certificate - hidden on screen, visible on print */}
      {product && isGenuine && (
        <div className="hidden print:block p-12">
          <div className="text-center border-4 border-primary p-10 max-w-lg mx-auto">
            <div className="text-2xl font-bold mb-2">🛡️ AuthentiChain</div>
            <h1 className="text-3xl font-extrabold mt-6 mb-8">CERTIFICATE OF AUTHENTICITY</h1>
            <div className="text-left space-y-2 mb-8">
              <p><strong>Product Name:</strong> {product.name}</p>
              <p><strong>Brand:</strong> {product.brand}</p>
              <p><strong>Product Code:</strong> {product.product_code}</p>
              <p><strong>Verification Hash:</strong> {product.verification_hash?.substring(0, 32)}...</p>
              <p><strong>Supply Chain Events:</strong> {events.length}</p>
              <p><strong>Verified At:</strong> {new Date().toLocaleString()}</p>
            </div>
            <div className="text-4xl font-extrabold text-green-600 border-4 border-green-600 inline-block px-8 py-3 rotate-[-5deg]">
              VERIFIED GENUINE
            </div>
            <p className="text-xs text-gray-500 mt-8">
              This product has been verified authentic via AuthentiChain supply chain verification system.
            </p>
          </div>
        </div>
      )}

      {/* Screen content */}
      <div className="print:hidden">
        <header className="border-b border-border bg-card/80 backdrop-blur-xl">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
                <Shield className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-bold text-sm">AuthentiChain</span>
            </Link>
            <span className="text-muted-foreground text-sm ml-auto">Product Verification</span>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 py-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Verify Product Authenticity</h1>
            <p className="text-muted-foreground mb-6">Enter a product code or scan a QR code to verify</p>
            <form onSubmit={(e) => { e.preventDefault(); handleVerify(); }} className="flex gap-2 max-w-md mx-auto">
              <Input placeholder="Enter product code (e.g. PRD-XXXXXXXX)" value={query} onChange={(e) => setQuery(e.target.value)} className="flex-1" />
              <Button type="submit" variant="hero" disabled={loading}>
                <Search className="w-4 h-4 mr-1" /> {loading ? "..." : "Verify"}
              </Button>
            </form>
          </motion.div>

          {/* Loading skeleton */}
          {loading && (
            <div className="space-y-4">
              <Skeleton className="h-28 w-full rounded-2xl" />
              <Skeleton className="h-48 w-full rounded-xl" />
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          )}

          {/* Result */}
          {searched && !loading && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              {product ? (
                <div className="space-y-6">
                  {/* Verification Status */}
                  <div className={`rounded-2xl p-6 border-2 ${isGenuine ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5"}`}>
                    <div className="flex items-center gap-4">
                      {isGenuine ? (
                        <CheckCircle2 className="w-12 h-12 text-success shrink-0" />
                      ) : (
                        <XCircle className="w-12 h-12 text-destructive shrink-0" />
                      )}
                      <div className="flex-1">
                        <h2 className="text-xl font-bold">{isGenuine ? "✅ Genuine Product" : "❌ Suspicious Product"}</h2>
                        <p className="text-sm text-muted-foreground mt-1">
                          {isGenuine ? "This product has been verified as authentic." : product.is_flagged ? `Flagged: ${product.flag_reason || "Suspicious activity detected"}` : `Status: ${product.status}`}
                        </p>
                      </div>
                      {isGenuine && (
                        <Button variant="outline" size="sm" onClick={() => window.print()}>
                          <Printer className="w-4 h-4 mr-1" /> Certificate
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Trust Score */}
                  <div className="bg-card rounded-xl border border-border p-5 shadow-card">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-sm">Trust Score</h3>
                      <span className={`text-sm font-bold ${trustColor}`}>{trustScore}/100 — {trustLabel}</span>
                    </div>
                    <Progress value={trustScore} className={`h-3 [&>div]:${trustBg}`} />
                  </div>

                  {/* Hash Chain Integrity */}
                  {hashChainValid !== null && (
                    <div className={`rounded-xl p-5 border-2 ${hashChainValid ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5"}`}>
                      <div className="flex items-center gap-3">
                        {hashChainValid ? <ShieldCheck className="w-6 h-6 text-success shrink-0" /> : <ShieldAlert className="w-6 h-6 text-destructive shrink-0" />}
                        <div>
                          <p className="font-semibold text-sm">
                            Hash Chain Integrity: {hashChainValid ? "Verified" : "TAMPERED"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {hashChainValid ? "All supply chain records are tamper-resistant." : "One or more records have been modified."}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Product details */}
                  <div className="bg-card rounded-xl border border-border p-6 shadow-card">
                    <h3 className="font-semibold mb-4">Product Details</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { label: "Name", value: product.name },
                        { label: "Brand", value: product.brand },
                        { label: "Code", value: product.product_code },
                        { label: "Category", value: product.category },
                        { label: "Origin", value: product.origin_country || "N/A" },
                        { label: "Status", value: product.status },
                        { label: "Manufactured", value: product.manufacture_date ? new Date(product.manufacture_date).toLocaleDateString() : "N/A" },
                        { label: "Expiry", value: product.expiry_date ? new Date(product.expiry_date).toLocaleDateString() : "N/A" },
                      ].map((f) => (
                        <div key={f.label}>
                          <p className="text-xs text-muted-foreground">{f.label}</p>
                          <p className="text-sm font-medium">{f.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 pt-4 border-t border-border">
                      <p className="text-xs text-muted-foreground">Verification Hash</p>
                      <p className="text-xs font-mono text-muted-foreground/70 break-all">{product.verification_hash}</p>
                    </div>
                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground">Scan Count: <span className="font-semibold">{scanCount}</span></p>
                    </div>
                  </div>

                  {/* Timeline */}
                  <div className="bg-card rounded-xl border border-border p-6 shadow-card">
                    <h3 className="font-semibold mb-4">Supply Chain Journey</h3>
                    {events.length > 0 ? (
                      <SupplyChainTimeline events={events} />
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">No supply chain events recorded</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 bg-card rounded-xl border border-border">
                  <XCircle className="w-12 h-12 mx-auto mb-3 text-destructive" />
                  <h2 className="text-xl font-bold">Product Not Found</h2>
                  <p className="text-sm text-muted-foreground mt-1">The product code you entered does not exist in our system.</p>
                </div>
              )}
            </motion.div>
          )}
        </main>
      </div>
    </div>
  );
}
