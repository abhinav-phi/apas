import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { SupplyChainTimeline } from "@/components/ui/timeline";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { QRCodeCanvas } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";
import {
  ArrowLeft, Package, Shield, AlertTriangle, CheckCircle2,
  Download, Copy, CheckCircle, MapPin, ArrowRight, ExternalLink
} from "lucide-react";
import { ProductImageUpload } from "@/components/ui/product-image-upload";
import { etherscanTxUrl } from "@/lib/blockchain";

interface ScanLog {
  id: string;
  created_at: string;
  scan_location: string | null;
  latitude: number | null;
  longitude: number | null;
  is_suspicious: boolean;
  suspicion_reason: string | null;
  user_agent: string | null;
  scanner_id: string | null;
}

interface FraudAlert {
  id: string;
  created_at: string;
  alert_type: string;
  severity: string;
  description: string;
  is_resolved: boolean;
}

const severityColors: Record<string, string> = {
  low: "text-blue-400 bg-blue-400/10",
  medium: "text-amber-400 bg-amber-400/10",
  high: "text-red-400 bg-red-400/10",
  critical: "text-red-500 bg-red-500/15",
};

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  const { toast } = useToast();

  const [product, setProduct] = useState<Tables<"products"> | null>(null);
  const [events, setEvents] = useState<Tables<"supply_chain_events">[]>([]);
  const [scanLogs, setScanLogs] = useState<ScanLog[]>([]);
  const [alerts, setAlerts] = useState<FraudAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    document.title = "Product Detail — AuthentiChain";

    const fetchAll = async () => {
      setLoading(true);
      const [prodRes, evtsRes, scansRes, alertsRes] = await Promise.all([
        supabase.from("products").select("*").eq("id", id).maybeSingle(),
        supabase.from("supply_chain_events").select("*").eq("product_id", id).order("created_at", { ascending: true }),
        supabase.from("scan_logs").select("*").eq("product_id", id).order("created_at", { ascending: false }).limit(20),
        supabase.from("fraud_alerts").select("*").eq("product_id", id).order("created_at", { ascending: false }),
      ]);

      if (prodRes.error || !prodRes.data) {
        toast({ title: "Product not found", variant: "destructive" });
        navigate("/products");
        return;
      }

      setProduct(prodRes.data);
      setEvents((evtsRes.data || []) as Tables<"supply_chain_events">[]);
      setScanLogs((scansRes.data || []) as unknown as ScanLog[]);
      setAlerts((alertsRes.data || []) as unknown as FraudAlert[]);
      setLoading(false);
    };

    fetchAll();
  }, [id, navigate, toast]);

  const downloadQR = () => {
    if (!product) return;
    const canvas = document.getElementById(`qr-detail-${product.product_code}`) as HTMLCanvasElement | null;
    if (!canvas) return;

    const exportCanvas = document.createElement("canvas");
    const padding = 32;
    const labelHeight = 48;
    exportCanvas.width = canvas.width + padding * 2;
    exportCanvas.height = canvas.height + padding * 2 + labelHeight;
    const ctx = exportCanvas.getContext("2d")!;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    ctx.drawImage(canvas, padding, padding);
    ctx.fillStyle = "#000000";
    ctx.font = "bold 16px monospace";
    ctx.textAlign = "center";
    ctx.fillText(product.product_code, exportCanvas.width / 2, canvas.height + padding + 24);
    ctx.fillStyle = "#666666";
    ctx.font = "12px sans-serif";
    ctx.fillText(product.name, exportCanvas.width / 2, canvas.height + padding + 42);

    const a = document.createElement("a");
    a.download = `QR-${product.product_code}.png`;
    a.href = exportCanvas.toDataURL("image/png", 1.0);
    a.click();
  };

  const copyCode = async () => {
    if (!product) return;
    try {
      await navigator.clipboard.writeText(product.product_code);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = product.product_code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const verifyUrl = product
    ? `${window.location.origin}/verify?code=${product.product_code}`
    : "";

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-32" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  if (!product) return null;

  const trustScore = product.trust_score ?? 100;
  const trustColor = trustScore >= 80 ? "#71ffe8" : trustScore >= 50 ? "#f9bc48" : "#ffb4ab";

  const infoFields = [
    { label: "Product Name", value: product.name },
    { label: "Brand", value: product.brand },
    { label: "Category", value: product.category },
    { label: "Origin Country", value: product.origin_country || "—" },
    { label: "Manufacture Date", value: product.manufacture_date ? new Date(product.manufacture_date).toLocaleDateString() : "—" },
    { label: "Expiry Date", value: product.expiry_date ? new Date(product.expiry_date).toLocaleDateString() : "—" },
    { label: "Status", value: product.status },
    { label: "Registered", value: new Date(product.created_at).toLocaleDateString() },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Back + Title */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <div>
            <p className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: "#71ffe8", fontFamily: "IBM Plex Mono, monospace" }}>
              Product
            </p>
            <h1 className="text-xl font-bold" style={{ color: "#dfe2eb" }}>{product.name}</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <StatusBadge status={product.is_flagged ? "suspicious" : product.status} />
            {role === "manufacturer" && (
              <Link to="/transfer-ownership" className="text-xs px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted/30 transition-colors flex items-center gap-1" style={{ color: "#849490" }}>
                <ArrowRight className="w-3 h-3" /> Transfer
              </Link>
            )}
          </div>
        </div>

        {/* Product Info + QR */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Info card */}
          <div className="bg-card rounded-xl border border-border p-5 shadow-card space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: "#dfe2eb" }}>
              <Package className="w-4 h-4" style={{ color: "#71ffe8" }} />
              Product Information
            </h2>

            <div className="grid grid-cols-2 gap-3">
              {infoFields.map((f) => (
                <div key={f.label}>
                  <p className="text-xs" style={{ color: "#849490", fontFamily: "IBM Plex Mono, monospace" }}>{f.label}</p>
                  <p className="text-sm font-medium capitalize" style={{ color: "#dfe2eb" }}>{f.value}</p>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-border">
              <p className="text-xs mb-1" style={{ color: "#849490", fontFamily: "IBM Plex Mono, monospace" }}>Product Code</p>
              <code className="text-sm font-mono" style={{ color: "#71ffe8" }}>{product.product_code}</code>
            </div>

            {/* Trust Score */}
            <div className="pt-3 border-t border-border">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs" style={{ color: "#849490", fontFamily: "IBM Plex Mono, monospace" }}>Trust Score</p>
                <span className="text-sm font-bold" style={{ color: trustColor }}>{trustScore}/100</span>
              </div>
              <div className="w-full h-2 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.max(0, Math.min(100, trustScore))}%`, background: trustColor }}
                />
              </div>
            </div>

            {/* Blockchain TX — honest link: Etherscan only once confirmed */}
            {product.blockchain_tx && (
              <div className="pt-3 border-t border-border">
                <p className="text-xs mb-1" style={{ color: "#849490", fontFamily: "IBM Plex Mono, monospace" }}>Hash Anchor</p>
                {product.blockchain_tx_status === "confirmed" ? (
                  <a
                    href={etherscanTxUrl(product.blockchain_tx)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-mono flex items-center gap-1 hover:underline"
                    style={{ color: "#71ffe8" }}
                  >
                    {product.blockchain_tx.substring(0, 24)}... <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="text-xs font-mono truncate block" style={{ color: "#849490" }}>
                    {product.blockchain_tx.substring(0, 24)}...
                  </span>
                )}
                <p className="text-xs mt-0.5" style={{ color: "#7d8d88", fontFamily: "IBM Plex Mono, monospace" }}>
                  {product.blockchain_tx_status === "confirmed"
                    ? "Confirmed on Sepolia (Ethereum testnet) — verified on-chain"
                    : product.blockchain_tx_status === "failed"
                    ? "Transaction reverted on-chain"
                    : "Anchor pending on-chain confirmation"}
                </p>
              </div>
            )}

            {/* Verification hash */}
            {product.verification_hash && (
              <div className="pt-3 border-t border-border">
                <p className="text-xs mb-1" style={{ color: "#849490", fontFamily: "IBM Plex Mono, monospace" }}>Verification Hash</p>
                <p className="text-xs font-mono break-all" style={{ color: "rgba(132,148,144,0.5)" }}>
                  {product.verification_hash}
                </p>
              </div>
            )}

            {/* Image Upload (manufacturer only) */}
            {role === "manufacturer" && (
              <div className="pt-3 border-t border-border">
                <p className="text-xs mb-2" style={{ color: "#849490", fontFamily: "IBM Plex Mono, monospace" }}>Product Image</p>
                <ProductImageUpload
                  productId={product.id}
                  currentImageUrl={product.image_url}
                  onUploaded={(url) => setProduct(p => p ? { ...p, image_url: url || null } : p)}
                  compact
                />
              </div>
            )}
            {role !== "manufacturer" && product.image_url && (
              <div className="pt-3 border-t border-border">
                <p className="text-xs mb-2" style={{ color: "#849490", fontFamily: "IBM Plex Mono, monospace" }}>Product Image</p>
                <img src={product.image_url} alt={product.name} className="w-full max-h-40 object-cover rounded-lg" />
              </div>
            )}
          </div>

          {/* QR Card */}
          <div className="bg-card rounded-xl border border-border p-5 shadow-card flex flex-col items-center justify-center gap-4">
            <h2 className="text-sm font-semibold self-start" style={{ color: "#dfe2eb" }}>
              QR Code
            </h2>
            <div className="inline-block p-4 bg-white rounded-xl">
              <QRCodeCanvas
                id={`qr-detail-${product.product_code}`}
                value={verifyUrl}
                size={180}
                level="H"
                bgColor="#FFFFFF"
                fgColor="#000000"
                marginSize={2}
              />
            </div>
            <p className="text-xs text-center font-mono" style={{ color: "#849490", maxWidth: "200px", wordBreak: "break-all" }}>
              {verifyUrl}
            </p>
            <div className="flex gap-2 w-full">
              <Button variant="outline" size="sm" onClick={downloadQR} className="flex-1">
                <Download className="w-3.5 h-3.5 mr-1" /> Download
              </Button>
              <Button variant="outline" size="sm" onClick={copyCode} className="flex-1">
                {copied ? <CheckCircle className="w-3.5 h-3.5 mr-1 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                {copied ? "Copied" : "Copy Code"}
              </Button>
            </div>
            <Link
              to={`/verify?code=${product.product_code}`}
              className="text-xs flex items-center gap-1 hover:underline"
              style={{ color: "#71ffe8" }}
              target="_blank"
            >
              Test Verification <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* Supply Chain Timeline */}
        <div className="bg-card rounded-xl border border-border p-5 shadow-card">
          <h2 className="text-sm font-semibold mb-4" style={{ color: "#dfe2eb" }}>Supply Chain Journey</h2>
          {events.length > 0 ? (
            <SupplyChainTimeline events={events} />
          ) : (
            <div className="text-center py-8">
              <Package className="w-10 h-10 mx-auto mb-2" style={{ color: "rgba(132,148,144,0.4)" }} />
              <p className="text-sm" style={{ color: "#849490" }}>No supply chain events recorded yet.</p>
            </div>
          )}
        </div>

        {/* Scan History */}
        {(role === "manufacturer" || role === "admin") && (
          <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold" style={{ color: "#dfe2eb" }}>Scan History</h2>
              <p className="text-xs mt-0.5" style={{ color: "#849490", fontFamily: "IBM Plex Mono, monospace" }}>
                Last {scanLogs.length} scans
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border" style={{ background: "#0a0e14" }}>
                    {["Timestamp", "Location", "Suspicious", "User Agent"].map((h) => (
                      <th key={h} className="text-left text-xs font-medium px-4 py-3" style={{ color: "#849490", fontFamily: "IBM Plex Mono, monospace" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {scanLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center py-8 text-sm" style={{ color: "#849490" }}>
                        No scans recorded
                      </td>
                    </tr>
                  ) : (
                    scanLogs.map((s) => (
                      <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 text-xs" style={{ color: "#849490", fontFamily: "IBM Plex Mono, monospace" }}>
                          {new Date(s.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {s.latitude && s.longitude ? (
                            <a
                              href={`https://www.google.com/maps?q=${s.latitude},${s.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 hover:underline"
                              style={{ color: "#71ffe8" }}
                            >
                              <MapPin className="w-3 h-3" />
                              {s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}
                            </a>
                          ) : (
                            <span style={{ color: "#849490" }}>{s.scan_location || "—"}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {s.is_suspicious ? (
                            <span className="flex items-center gap-1 text-xs" style={{ color: "#ffb4ab" }}>
                              <AlertTriangle className="w-3 h-3" /> Yes
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs" style={{ color: "#71ffe8" }}>
                              <CheckCircle2 className="w-3 h-3" /> No
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs truncate max-w-[200px]" style={{ color: "#849490" }}>
                          {s.user_agent ? s.user_agent.substring(0, 60) + "..." : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Fraud Alerts */}
        {(role === "manufacturer" || role === "admin") && alerts.length > 0 && (
          <div className="bg-card rounded-xl border border-border p-5 shadow-card space-y-3">
            <h2 className="text-sm font-semibold" style={{ color: "#dfe2eb" }}>Fraud Alerts</h2>
            {alerts.map((a) => (
              <div
                key={a.id}
                className="flex items-start gap-3 p-3 rounded-lg border"
                style={{ borderColor: a.is_resolved ? "rgba(113,255,232,0.1)" : "rgba(255,180,171,0.2)", background: a.is_resolved ? "rgba(113,255,232,0.02)" : "rgba(255,180,171,0.04)" }}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: a.is_resolved ? "rgba(113,255,232,0.1)" : "rgba(255,180,171,0.1)" }}>
                  {a.is_resolved
                    ? <CheckCircle2 className="w-4 h-4" style={{ color: "#71ffe8" }} />
                    : <AlertTriangle className="w-4 h-4" style={{ color: "#ffb4ab" }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium capitalize" style={{ color: "#dfe2eb" }}>
                      {a.alert_type.replace(/_/g, " ")}
                    </p>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${severityColors[a.severity] || ""}`}>
                      {a.severity}
                    </span>
                    {a.is_resolved && (
                      <span className="px-2 py-0.5 rounded-full text-xs" style={{ color: "#71ffe8", background: "rgba(113,255,232,0.1)" }}>
                        Resolved
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-1" style={{ color: "#849490" }}>{a.description}</p>
                  <p className="text-xs mt-1" style={{ color: "#7d8d88", fontFamily: "IBM Plex Mono, monospace" }}>
                    {new Date(a.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
