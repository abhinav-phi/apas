import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SupplyChainTimeline } from "@/components/ui/timeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Shield, Search, CheckCircle2, XCircle, ShieldCheck, ShieldAlert, Camera, CameraOff, Printer, ExternalLink, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ────────────────────────────────────────────────
type VerifyResult = {
  valid: boolean;
  type: "GENUINE" | "CLONE" | "TAMPERED" | "NOT_FOUND";
  message: string;
  scan_count?: number;
  trust_score?: number;
  hash_chain_valid?: boolean;
  first_scanned_at?: string;
  product?: {
    id: string;
    name: string;
    brand: string;
    product_code: string;
    category?: string;
    status?: string;
    origin_country?: string;
    manufacture_date?: string;
    expiry_date?: string;
    verification_hash?: string;
    blockchain_tx?: string;
    scan_status?: string;
    trust_score?: number;
    is_flagged?: boolean;
    created_at?: string;
  };
};

type ViewState = "idle" | "loading" | "genuine" | "clone" | "tampered" | "not_found";

// ─── Component ────────────────────────────────────────────
export default function Verify() {
  const [searchParams] = useSearchParams();
  const tokenParam = searchParams.get("token") || "";
  const codeParam = searchParams.get("code") || "";
  const initialQuery = tokenParam || decodeURIComponent(codeParam || "");

  const [query, setQuery] = useState(initialQuery);
  const [viewState, setViewState] = useState<ViewState>("idle");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [cameraActive, setCameraActive] = useState(false);
  const scannerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = "Verify — AuthentiChain";
    if (initialQuery) {
      handleVerify(initialQuery);
    }
    return () => {
      stopCamera();
    };
  }, []);

  // ─── Camera QR Scanner ──────────────────────────────────
  const startCamera = useCallback(async () => {
    if (scannerRef.current) return;
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;
      setCameraActive(true);

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText: string) => {
          // Extract code/token from URL if scanned from QR
          let code = decodedText;
          try {
            const url = new URL(decodedText);
            code = url.searchParams.get("token") || url.searchParams.get("code") || decodedText;
          } catch {
            // Not a URL, use as-is
          }
          stopCamera();
          setQuery(code);
          handleVerify(code);
        },
        () => {} // ignore scan failures (keep trying)
      );
    } catch (err) {
      console.error("Camera error:", err);
      setCameraActive(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {});
      scannerRef.current.clear().catch(() => {});
      scannerRef.current = null;
    }
    setCameraActive(false);
  }, []);

  // ─── Geolocation helper ─────────────────────────────────
  const getPosition = (): Promise<{ lat: number; lng: number } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 5000 }
      );
    });
  };

  // ─── Main Verification ──────────────────────────────────
  const handleVerify = async (input?: string) => {
    const q = (input || query).trim();
    if (!q) return;
    setViewState("loading");
    setResult(null);
    setEvents([]);

    try {
      // Get geo location (non-blocking)
      const pos = await getPosition();

      // Call the SINGLE RPC
      const { data, error } = await supabase.rpc("verify_product_secure", {
        p_product_code: q,
        p_lat: pos?.lat ?? undefined,
        p_lng: pos?.lng ?? undefined,
        p_user_agent: navigator.userAgent,
      });

      if (error) {
        console.error("RPC Error:", error);
        setViewState("not_found");
        setResult({ valid: false, type: "NOT_FOUND", message: error.message });
        return;
      }

      const res = data as unknown as VerifyResult;
      setResult(res);

      // Set view state based on result
      if (!res.valid) {
        if (res.type === "CLONE") setViewState("clone");
        else if (res.type === "TAMPERED") setViewState("tampered");
        else setViewState("not_found");
      } else {
        setViewState("genuine");

        // Fetch supply chain events for genuine products
        if (res.product?.id) {
          const { data: evts } = await supabase
            .from("supply_chain_events")
            .select("*")
            .eq("product_id", res.product.id)
            .order("created_at", { ascending: true });
          setEvents(evts || []);
        }
      }
    } catch (err) {
      console.error("Verification error:", err);
      setViewState("not_found");
      setResult({ valid: false, type: "NOT_FOUND", message: "Network error. Please try again." });
    }
  };

  const resetVerification = () => {
    setViewState("idle");
    setResult(null);
    setEvents([]);
    setQuery("");
  };

  const trustScore = result?.trust_score ?? result?.product?.trust_score ?? 0;
  const trustLabel = trustScore >= 80 ? "High Trust" : trustScore >= 50 ? "Medium Trust" : "Low Trust";
  const trustColor = trustScore >= 80 ? "text-emerald-400" : trustScore >= 50 ? "text-amber-400" : "text-red-400";

  // ─── FULL SCREEN: Loading ─────────────────────────────
  if (viewState === "loading") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center"
        >
          <Loader2 className="w-16 h-16 text-blue-400 animate-spin mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-white mb-2">Verifying Product</h1>
          <p className="text-slate-400 text-sm">Running security checks...</p>
          <div className="mt-6 flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Clone Detection</span>
            <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Geo Analysis</span>
            <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Chain Integrity</span>
          </div>
        </motion.div>
      </div>
    );
  }

  // ─── FULL SCREEN: Clone / Counterfeit ─────────────────
  if (viewState === "clone") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-red-950 via-red-900 to-red-800">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
          className="text-center max-w-lg mx-auto px-6"
        >
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
          >
            <XCircle className="w-24 h-24 text-red-300 mx-auto mb-6" />
          </motion.div>
          <h1 className="text-4xl font-extrabold text-white mb-4">⚠️ COUNTERFEIT DETECTED ⚠️</h1>
          <p className="text-red-200 text-lg mb-6">{result?.message}</p>
          {result?.product && (
            <div className="bg-red-800/50 rounded-xl p-4 mb-6 text-left border border-red-700/50">
              <p className="text-red-200 text-sm"><span className="text-red-400 font-semibold">Product:</span> {result.product.name}</p>
              <p className="text-red-200 text-sm"><span className="text-red-400 font-semibold">Brand:</span> {result.product.brand}</p>
              <p className="text-red-200 text-sm"><span className="text-red-400 font-semibold">Code:</span> {result.product.product_code}</p>
            </div>
          )}
          <p className="text-red-300/70 text-xs mb-8">
            This QR code has already been used. The product you are holding is likely a fake.
            Report this to the manufacturer immediately.
          </p>
          <Button
            onClick={resetVerification}
            className="bg-white text-red-900 hover:bg-red-100 font-semibold px-8 py-3 rounded-lg shadow-lg"
          >
            Scan Another Product
          </Button>
        </motion.div>
      </div>
    );
  }

  // ─── FULL SCREEN: Tampered ────────────────────────────
  if (viewState === "tampered") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-orange-950 via-red-900 to-red-800">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
          className="text-center max-w-lg mx-auto px-6"
        >
          <ShieldAlert className="w-24 h-24 text-orange-300 mx-auto mb-6" />
          <h1 className="text-4xl font-extrabold text-white mb-4">🔗 CHAIN TAMPERED</h1>
          <p className="text-orange-200 text-lg mb-6">{result?.message}</p>
          <p className="text-orange-300/70 text-xs mb-8">
            The supply chain records for this product have been modified.
            This product's authenticity cannot be guaranteed.
          </p>
          <Button
            onClick={resetVerification}
            className="bg-white text-orange-900 hover:bg-orange-100 font-semibold px-8 py-3 rounded-lg shadow-lg"
          >
            Scan Another Product
          </Button>
        </motion.div>
      </div>
    );
  }

  // ─── FULL SCREEN: Genuine ─────────────────────────────
  if (viewState === "genuine" && result?.product) {
    const prod = result.product;
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-800 print:bg-white">
        {/* Print certificate */}
        <div className="hidden print:block p-12">
          <div className="text-center border-4 border-emerald-600 p-10 max-w-lg mx-auto">
            <div className="text-2xl font-bold mb-2">🛡️ AuthentiChain</div>
            <h1 className="text-3xl font-extrabold mt-6 mb-8">CERTIFICATE OF AUTHENTICITY</h1>
            <div className="text-left space-y-2 mb-8">
              <p><strong>Product Name:</strong> {prod.name}</p>
              <p><strong>Brand:</strong> {prod.brand}</p>
              <p><strong>Product Code:</strong> {prod.product_code}</p>
              <p><strong>Trust Score:</strong> {trustScore}/100</p>
              <p><strong>Supply Chain Events:</strong> {events.length}</p>
              <p><strong>Verified At:</strong> {new Date().toLocaleString()}</p>
            </div>
            <div className="text-4xl font-extrabold text-emerald-600 border-4 border-emerald-600 inline-block px-8 py-3 rotate-[-5deg]">
              VERIFIED GENUINE
            </div>
          </div>
        </div>

        {/* Screen content */}
        <div className="print:hidden">
          {/* Hero verification banner */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center pt-12 pb-8 px-4"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
            >
              <CheckCircle2 className="w-20 h-20 text-emerald-300 mx-auto mb-4" />
            </motion.div>
            <h1 className="text-4xl font-extrabold text-white mb-2">AUTHENTIC</h1>
            <p className="text-emerald-200 text-lg mb-1">{result.message}</p>
            <p className="text-emerald-300/60 text-sm">Scanned {result.scan_count || 1} time{(result.scan_count || 1) > 1 ? "s" : ""}</p>
          </motion.div>

          <div className="max-w-2xl mx-auto px-4 pb-12 space-y-4">
            {/* Trust Score */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white/10 backdrop-blur-lg rounded-2xl p-5 border border-white/10"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm text-white/80">Trust Score</h3>
                <span className={`text-sm font-bold ${trustColor}`}>{trustScore}/100 — {trustLabel}</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${trustScore}%` }}
                  transition={{ duration: 1, delay: 0.5 }}
                  className={`h-full rounded-full ${trustScore >= 80 ? "bg-emerald-400" : trustScore >= 50 ? "bg-amber-400" : "bg-red-400"}`}
                />
              </div>
            </motion.div>

            {/* Blockchain Badge */}
            {prod.blockchain_tx && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="bg-white/10 backdrop-blur-lg rounded-2xl p-5 border border-white/10"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                    <ShieldCheck className="w-5 h-5 text-emerald-300" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-white">✅ Anchored on Sepolia</p>
                    <a
                      href={`https://sepolia.etherscan.io/tx/${prod.blockchain_tx}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-emerald-300 hover:text-emerald-200 flex items-center gap-1 font-mono"
                    >
                      {prod.blockchain_tx.substring(0, 18)}...{prod.blockchain_tx.substring(prod.blockchain_tx.length - 8)}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Hash Chain Status */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-white/10 backdrop-blur-lg rounded-2xl p-5 border border-white/10"
            >
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-6 h-6 text-emerald-300" />
                <div>
                  <p className="text-sm font-semibold text-white">Hash Chain Integrity: Verified</p>
                  <p className="text-xs text-white/50">All supply chain records are tamper-resistant.</p>
                </div>
              </div>
            </motion.div>

            {/* Product Details */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/10"
            >
              <h3 className="font-semibold text-white mb-4">Product Details</h3>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Name", value: prod.name },
                  { label: "Brand", value: prod.brand },
                  { label: "Code", value: prod.product_code },
                  { label: "Category", value: prod.category || "N/A" },
                  { label: "Origin", value: prod.origin_country || "N/A" },
                  { label: "Status", value: prod.status || "active" },
                  { label: "Manufactured", value: prod.manufacture_date ? new Date(prod.manufacture_date).toLocaleDateString() : "N/A" },
                  { label: "Expiry", value: prod.expiry_date ? new Date(prod.expiry_date).toLocaleDateString() : "N/A" },
                ].map((f) => (
                  <div key={f.label}>
                    <p className="text-xs text-white/40">{f.label}</p>
                    <p className="text-sm font-medium text-white">{f.value}</p>
                  </div>
                ))}
              </div>
              {prod.verification_hash && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <p className="text-xs text-white/40">Verification Hash</p>
                  <p className="text-xs font-mono text-white/30 break-all">{prod.verification_hash}</p>
                </div>
              )}
            </motion.div>

            {/* Supply Chain Timeline */}
            {events.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/10"
              >
                <h3 className="font-semibold text-white mb-4">Supply Chain Journey</h3>
                <SupplyChainTimeline events={events} />
              </motion.div>
            )}

            {/* Action buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="flex gap-3 pt-2"
            >
              <Button
                onClick={() => window.print()}
                className="flex-1 bg-white/10 hover:bg-white/20 text-white border border-white/20"
              >
                <Printer className="w-4 h-4 mr-2" /> Print Certificate
              </Button>
              <Button
                onClick={resetVerification}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold"
              >
                Scan Another
              </Button>
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  // ─── IDLE / NOT FOUND: Scanner + Input ──────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="border-b border-white/10 bg-white/5 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-sm text-white">AuthentiChain</span>
          </Link>
          <span className="text-white/40 text-sm ml-auto">Product Verification</span>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <Shield className="w-12 h-12 text-blue-400 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-white mb-2">Verify Product</h1>
          <p className="text-slate-400 text-sm">Scan a QR code or enter a product code to verify authenticity</p>
        </motion.div>

        {/* Camera Scanner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <div
            className={`relative rounded-2xl overflow-hidden border-2 transition-colors ${
              cameraActive ? "border-blue-500/50 bg-black" : "border-white/10 bg-white/5"
            }`}
          >
            <div id="qr-reader" className={cameraActive ? "block" : "hidden"} />
            {!cameraActive && (
              <div className="py-16 text-center">
                <Camera className="w-12 h-12 text-slate-500 mx-auto mb-3" />
                <p className="text-slate-400 text-sm mb-4">Point your camera at a product QR code</p>
                <Button
                  onClick={startCamera}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2 rounded-lg shadow-sm"
                >
                  <Camera className="w-4 h-4 mr-2" /> Open Camera
                </Button>
              </div>
            )}
            {cameraActive && (
              <div className="p-3 text-center">
                <Button
                  onClick={stopCamera}
                  variant="outline"
                  className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                  size="sm"
                >
                  <CameraOff className="w-4 h-4 mr-2" /> Stop Camera
                </Button>
              </div>
            )}
          </div>
        </motion.div>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-slate-500 text-xs font-medium uppercase">or enter manually</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* Manual input */}
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          onSubmit={(e) => { e.preventDefault(); handleVerify(); }}
          className="flex gap-2 mb-8"
        >
          <Input
            placeholder="Product code or token"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-white/10 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500"
          />
          <Button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 rounded-lg shadow-sm"
          >
            <Search className="w-4 h-4 mr-1" /> Verify
          </Button>
        </motion.form>

        {/* Not Found Result */}
        <AnimatePresence>
          {viewState === "not_found" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="text-center py-12 bg-white/5 rounded-2xl border border-white/10"
            >
              <XCircle className="w-16 h-16 mx-auto mb-4 text-red-400" />
              <h2 className="text-xl font-bold text-white mb-2">Product Not Found</h2>
              <p className="text-slate-400 text-sm">{result?.message || "The product code you entered does not exist in our system."}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* How It Works */}
        {viewState === "idle" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-8 grid grid-cols-3 gap-4 text-center"
          >
            {[
              { icon: "📷", label: "Scan QR", desc: "Point camera at code" },
              { icon: "🔍", label: "Verify", desc: "Instant security checks" },
              { icon: "✅", label: "Result", desc: "Authentic or counterfeit" },
            ].map((s) => (
              <div key={s.label} className="p-4 rounded-xl bg-white/5 border border-white/5">
                <div className="text-2xl mb-2">{s.icon}</div>
                <p className="text-white text-xs font-semibold">{s.label}</p>
                <p className="text-slate-500 text-[10px] mt-1">{s.desc}</p>
              </div>
            ))}
          </motion.div>
        )}
      </main>
    </div>
  );
}
