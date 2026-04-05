import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SupplyChainTimeline } from "@/components/ui/timeline";
import { FlowButton } from "@/components/ui/flow-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Shield,
  Search,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  ShieldAlert,
  Camera,
  CameraOff,
  Printer,
  ExternalLink,
  Loader2,
  AlertTriangle,
  RotateCcw,
  ScanLine,
  MapPin,
} from "lucide-react";
import { AppFooter } from "@/components/layout/AppFooter";

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

type GeoInfo = {
  status: "idle" | "requesting" | "granted" | "denied" | "unavailable";
  lat: number | null;
  lng: number | null;
};

type ViewState = "scanning" | "verifying" | "genuine" | "fake";

function extractProductCode(raw: string): string {
  const input = (raw || "").trim();
  if (!input) return "";
  if (input.includes("::")) return input.split("::")[0]?.trim() || input;
  try {
    const url = new URL(input);
    const token = url.searchParams.get("token");
    const code = url.searchParams.get("code");
    const fromParams = (token || code || "").trim();
    if (fromParams)
      return fromParams.includes("::") ? fromParams.split("::")[0] : fromParams;
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      const last = decodeURIComponent(segments[segments.length - 1]);
      return last.includes("::") ? last.split("::")[0] : last;
    }
  } catch {
    // not a URL
  }
  return input;
}

function getFakeLabel(type?: string) {
  switch (type) {
    case "CLONE":
      return {
        title: "Counterfeit Detected",
        subtitle:
          "This QR code has already been scanned elsewhere. The product you are holding is likely a clone.",
        icon: XCircle,
      };
    case "TAMPERED":
      return {
        title: "Chain Tampered",
        subtitle:
          "Supply chain records have been modified. Authenticity cannot be guaranteed.",
        icon: ShieldAlert,
      };
    default:
      return {
        title: "Product Not Found",
        subtitle:
          "This product code does not exist in our system. It may be counterfeit.",
        icon: AlertTriangle,
      };
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(label)), ms)
    ),
  ]);
}

export default function Verify() {
  const [searchParams] = useSearchParams();
  const tokenParam = searchParams.get("token") || "";
  const codeParam = searchParams.get("code") || "";
  const initialQuery = tokenParam || decodeURIComponent(codeParam || "");

  const [query, setQuery] = useState(initialQuery);
  const [viewState, setViewState] = useState<ViewState>("scanning");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [geo, setGeo] = useState<GeoInfo>({
    status: "idle",
    lat: null,
    lng: null,
  });

  const scannerRef = useRef<any>(null);
  const hasScannedRef = useRef(false);
  const isVerifyingRef = useRef(false);
  const handleVerifyRef = useRef<(input?: string) => Promise<void>>();
  const geoRef = useRef<GeoInfo>({ status: "idle", lat: null, lng: null });

  const log = (...args: any[]) => console.log("[Verify]", ...args);

  // Keep geoRef in sync with state
  useEffect(() => {
    geoRef.current = geo;
  }, [geo]);

  /* ───────── STOP CAMERA ───────── */
  const stopCamera = useCallback(async () => {
    log("stopCamera called, scannerRef exists:", !!scannerRef.current);
    const inst = scannerRef.current;
    scannerRef.current = null;
    setCameraActive(false);

    if (!inst) return;

    try {
      // html5-qrcode exposes getState(): 1=NOT_STARTED, 2=SCANNING, 3=PAUSED
      const state = inst.getState?.();
      log("scanner state before stop:", state);
      if (state === 2 || state === undefined) {
        await inst.stop();
        log("scanner stopped OK");
      }
    } catch (e: any) {
      log("stop error (safe to ignore):", e?.message);
    }
    try {
      inst.clear();
      log("scanner cleared OK");
    } catch (e: any) {
      log("clear error (safe to ignore):", e?.message);
    }
  }, []);

  /* ───────── GEO: silent background request ───────── */
  const requestGeo = useCallback(() => {
    if (!navigator.geolocation) {
      setGeo({ status: "unavailable", lat: null, lng: null });
      return;
    }
    log("geo: requesting");
    setGeo((p) => ({ ...p, status: "requesting" }));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        log("geo: OK", pos.coords.latitude, pos.coords.longitude);
        setGeo({
          status: "granted",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      (err) => {
        log("geo: error", err.code, err.message);
        setGeo({
          status: err.code === 1 ? "denied" : "unavailable",
          lat: null,
          lng: null,
        });
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 }
    );
  }, []);

  /* ───────── GEO: get fresh coords for verification ───────── */
  const getFreshGeo = useCallback(async (): Promise<{
    lat: number | null;
    lng: number | null;
  }> => {
    const c = geoRef.current;
    // Already denied/unavailable — return whatever we have
    if (c.status === "denied" || c.status === "unavailable")
      return { lat: c.lat, lng: c.lng };
    // Already have coords — use them
    if (c.lat !== null && c.lng !== null) return { lat: c.lat, lng: c.lng };
    // Try one more time with a tight timeout
    if (!navigator.geolocation) return { lat: null, lng: null };
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve({ lat: null, lng: null }), 4000);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(t);
          setGeo({
            status: "granted",
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => {
          clearTimeout(t);
          resolve({ lat: null, lng: null });
        },
        { enableHighAccuracy: false, timeout: 3500, maximumAge: 60000 }
      );
    });
  }, []);

  /* ───────── MAIN VERIFICATION ───────── */
  const handleVerify = useCallback(
    async (input?: string) => {
      const raw = (input || query).trim();
      const q = extractProductCode(raw).trim();
      log("handleVerify called:", { raw, extracted: q });

      if (!q) return;
      if (isVerifyingRef.current) {
        log("already verifying, skipping");
        return;
      }
      isVerifyingRef.current = true;

      try {
        await stopCamera();
        setViewState("verifying");
        setResult(null);
        setEvents([]);

        const pos = await getFreshGeo();
        log("geo for RPC:", pos);

        log("RPC starting: verify_product_secure, code:", q);
        const { data, error } = await withTimeout(
          supabase.rpc("verify_product_secure", {
            p_product_code: q,
            p_lat: pos.lat ?? undefined,
            p_lng: pos.lng ?? undefined,
            p_user_agent: navigator.userAgent,
          }),
          10000,
          "RPC timeout"
        );
        log("RPC response: error=", error, "data=", data);

        if (error) {
          setResult({
            valid: false,
            type: "NOT_FOUND",
            message: error.message || "Verification failed.",
          });
          setViewState("fake");
          return;
        }

        const res = data as unknown as VerifyResult;
        log("parsed result:", res);
        setResult(res);

        if (!res.valid) {
          setViewState("fake");
          return;
        }

        setViewState("genuine");

        if (res.product?.id) {
          log("fetching supply_chain_events for:", res.product.id);
          const { data: evts } = await supabase
            .from("supply_chain_events")
            .select("*")
            .eq("product_id", res.product.id)
            .order("created_at", { ascending: true });
          log("events fetched:", evts?.length || 0);
          setEvents(evts || []);
        }
      } catch (err: any) {
        console.error("Verification error:", err);
        setResult({
          valid: false,
          type: "NOT_FOUND",
          message:
            err?.message === "RPC timeout"
              ? "Verification timed out. Please try again."
              : "Network error. Please try again.",
        });
        setViewState("fake");
      } finally {
        isVerifyingRef.current = false;
        log("handleVerify done");
      }
    },
    [query, stopCamera, getFreshGeo]
  );

  // Keep ref in sync so scan callback always uses latest handleVerify
  useEffect(() => {
    handleVerifyRef.current = handleVerify;
  }, [handleVerify]);

  /* ───────── START CAMERA ───────── */
  const startCamera = useCallback(async () => {
    log("startCamera called");
    setCameraError(null);

    // Clean up any existing scanner first
    if (scannerRef.current) {
      log("cleaning up old scanner first");
      await stopCamera();
    }

    const container = document.getElementById("qr-reader");
    if (!container) {
      log("FATAL: #qr-reader not in DOM");
      setCameraError("Scanner container not found. Please refresh.");
      return;
    }
    log("container:", container.offsetWidth, "x", container.offsetHeight);

    hasScannedRef.current = false;
    container.innerHTML = ""; // Clear old scanner artifacts

    try {
      log("importing html5-qrcode...");
      const { Html5Qrcode } = await import("html5-qrcode");
      log("import OK");

      // ✅ Use the FULL working config from v1 (BarcodeDetector + high fps)
      const scanner = new Html5Qrcode("qr-reader", {
        verbose: false,
        useBarCodeDetectorIfSupported: true, // Native BarcodeDetector: faster on Chrome/Android
      });
      scannerRef.current = scanner;
      log("scanner instance created");

      // Responsive scan box — larger = much better detection
      const containerWidth = container.offsetWidth || 320;
      const scanSize = Math.min(Math.floor(containerWidth * 0.8), 400);
      log("scanSize:", scanSize, "from containerWidth:", containerWidth);

      // ✅ HIGH fps + large scan area from v1
      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 30,                                      // High fps — scan every frame
          qrbox: { width: scanSize, height: scanSize }, // Large responsive scan area
          disableFlip: false,                           // Allow mirrored QR codes
        },
        (decodedText: string) => {
          // SUCCESS CALLBACK
          if (hasScannedRef.current) {
            log("already handled scan, ignoring");
            return;
          }
          hasScannedRef.current = true;

          log("QR DETECTED raw:", decodedText);
          const code = extractProductCode(decodedText).trim();
          log("extracted code:", code);

          if (!code) {
            hasScannedRef.current = false;
            return;
          }

          // Stop scanner immediately
          const inst = scannerRef.current;
          scannerRef.current = null;
          setCameraActive(false);
          if (inst) {
            inst
              .stop()
              .then(() => {
                try { inst.clear(); } catch {}
              })
              .catch(() => {});
          }

          setQuery(code);
          if (handleVerifyRef.current) handleVerifyRef.current(code);
        },
        () => {
          // Per-frame no-detection — intentionally silent
        }
      );

      setCameraActive(true);
      log("CAMERA IS LIVE — fps=30, scanSize=", scanSize, ", BarcodeDetector=true");

      // ✅ Request geo AFTER camera is live to avoid permission dialog conflict
      // Small delay so camera permission dialog doesn't overlap geo dialog
      if (geoRef.current.status === "idle") {
        setTimeout(() => {
          log("requesting geo after camera settled");
          requestGeo();
        }, 1500);
      }
    } catch (err: any) {
      log("CAMERA ERROR:", err?.message || err);
      console.error("Full camera error:", err);

      const inst = scannerRef.current;
      scannerRef.current = null;
      setCameraActive(false);
      if (inst) {
        try { inst.clear(); } catch {}
      }

      // User-friendly error messages
      let msg = "Could not start camera.";
      const errMsg = (err?.message || "").toLowerCase();
      if (
        errMsg.includes("permission") ||
        errMsg.includes("denied") ||
        errMsg.includes("notallowed")
      ) {
        msg = "Camera permission denied. Please allow camera access and try again.";
      } else if (
        errMsg.includes("notfound") ||
        errMsg.includes("not found") ||
        errMsg.includes("no camera")
      ) {
        msg = "No camera found on this device.";
      } else if (
        errMsg.includes("insecure") ||
        errMsg.includes("https")
      ) {
        msg = "Camera requires HTTPS. Please use a secure connection.";
      } else if (errMsg.includes("in use") || errMsg.includes("busy")) {
        msg = "Camera is being used by another app. Close it and try again.";
      }
      setCameraError(msg);
    }
  }, [stopCamera, requestGeo]);

  /* ───────── MOUNT / UNMOUNT ───────── */
  useEffect(() => {
    document.title = "Verify — AuthentiChain";
    log("component mounted. initialQuery:", initialQuery);

    if (initialQuery) {
      // If landing with a token/code, request geo first then verify
      requestGeo();
      handleVerify(initialQuery);
    }
    // Do NOT auto-request geo on plain mount — wait for camera start or manual submit

    return () => {
      log("component unmounting, stopping camera");
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ───────── RESET ───────── */
  const resetVerification = useCallback(async () => {
    log("resetVerification");
    hasScannedRef.current = false;
    isVerifyingRef.current = false;
    await stopCamera();
    setViewState("scanning");
    setResult(null);
    setEvents([]);
    setQuery("");
    setCameraError(null);
  }, [stopCamera]);

  /* ───────── DERIVED VALUES ───────── */
  const trustScore = result?.trust_score ?? result?.product?.trust_score ?? 0;
  const trustLabel =
    trustScore >= 80 ? "High Trust" : trustScore >= 50 ? "Medium Trust" : "Low Trust";
  const trustColor =
    trustScore >= 80
      ? "text-emerald-600"
      : trustScore >= 50
      ? "text-amber-600"
      : "text-red-600";
  const trustBarColor =
    trustScore >= 80
      ? "bg-emerald-500"
      : trustScore >= 50
      ? "bg-amber-500"
      : "bg-red-500";

  /* ───────── GEO STATUS BADGE ───────── */
  const GeoStatusBadge = () => {
    if (geo.status === "granted" && geo.lat !== null)
      return (
        <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
          <MapPin className="w-3 h-3" />
          <span>
            {geo.lat.toFixed(4)}, {geo.lng!.toFixed(4)}
          </span>
        </div>
      );
    if (geo.status === "requesting")
      return (
        <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Getting location...</span>
        </div>
      );
    if (geo.status === "denied")
      return (
        <button
          onClick={requestGeo}
          className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 px-2.5 py-1 rounded-full hover:bg-red-100"
        >
          <MapPin className="w-3 h-3" />
          <span>Location denied — retry</span>
        </button>
      );
    return null;
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // VIEW: VERIFYING
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (viewState === "verifying") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white">
        <div className="relative w-16 h-16 mb-6">
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary border-r-primary/50 animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Shield className="w-6 h-6 text-primary" />
          </div>
        </div>
        <h1 className="text-xl font-semibold text-foreground mb-1">
          Verifying product...
        </h1>
        <p className="text-muted-foreground text-sm mb-8">Running security checks</p>
        <div className="space-y-3 text-left max-w-xs">
          {["Clone Detection", "Geo-location Analysis", "Hash Chain Integrity"].map(
            (label) => (
              <div key={label} className="flex items-center gap-3 text-sm">
                <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
                <span className="text-muted-foreground">{label}</span>
              </div>
            )
          )}
        </div>
        {geo.lat !== null && (
          <div className="mt-6 flex items-center gap-1.5 text-xs text-emerald-600">
            <MapPin className="w-3 h-3" />
            <span>
              Location: {geo.lat.toFixed(4)}, {geo.lng!.toFixed(4)}
            </span>
          </div>
        )}
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // VIEW: FAKE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (viewState === "fake") {
    const fakeInfo = getFakeLabel(result?.type);
    const FakeIcon = fakeInfo.icon;
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <header className="border-b bg-card/80 backdrop-blur-xl">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2">
              <img src="/apas.png" alt="AuthentiChain Logo" className="w-8 h-8 object-contain rounded-sm" />
              <span className="font-bold text-sm">AuthentiChain</span>
            </Link>
          </div>
        </header>

        <div className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="text-center max-w-md w-full">
            <FakeIcon className="w-16 h-16 text-destructive mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-foreground mb-2">
              {fakeInfo.title}
            </h1>
            {result?.message && (
              <p className="text-muted-foreground mb-6">{result.message}</p>
            )}
            {result?.product && (
              <div className="rounded-lg p-4 mb-6 text-left border bg-muted/30">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Product", value: result.product.name },
                    { label: "Brand", value: result.product.brand },
                    { label: "Code", value: result.product.product_code },
                    result.scan_count
                      ? {
                          label: "Scan Count",
                          value: `${result.scan_count} scans`,
                        }
                      : null,
                  ]
                    .filter(Boolean)
                    .map((f: any) => (
                      <div key={f.label}>
                        <p className="text-xs text-muted-foreground">{f.label}</p>
                        <p className="text-sm font-medium">{f.value}</p>
                      </div>
                    ))}
                </div>
              </div>
            )}
            {geo.lat !== null && (
              <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mb-4">
                <MapPin className="w-3 h-3" />
                <span>
                  Scanned from: {geo.lat.toFixed(4)}, {geo.lng!.toFixed(4)}
                </span>
              </div>
            )}
            <p className="text-muted-foreground text-sm mb-8 max-w-sm mx-auto">
              {fakeInfo.subtitle}
            </p>
            <div className="flex justify-center mt-4">
              <FlowButton onClick={resetVerification} size="sm" text={<span className="flex items-center gap-1"><RotateCcw className="w-4 h-4" /> Scan Again</span>} />
            </div>
          </div>
        </div>
        <AppFooter />
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // VIEW: GENUINE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (viewState === "genuine" && result?.product) {
    const prod = result.product;
    return (
      <div className="min-h-screen flex flex-col bg-white print:bg-white">
        {/* Print-only certificate */}
        <div className="hidden print:block p-12">
          <div className="text-center border-2 border-emerald-600 p-10 max-w-lg mx-auto">
            <div className="text-xl font-bold mb-2">AuthentiChain</div>
            <h1 className="text-2xl font-bold mt-6 mb-8">
              CERTIFICATE OF AUTHENTICITY
            </h1>
            <div className="text-left space-y-2 mb-8">
              <p>
                <strong>Product Name:</strong> {prod.name}
              </p>
              <p>
                <strong>Brand:</strong> {prod.brand}
              </p>
              <p>
                <strong>Product Code:</strong> {prod.product_code}
              </p>
              <p>
                <strong>Trust Score:</strong> {trustScore}/100
              </p>
              <p>
                <strong>Supply Chain Events:</strong> {events.length}
              </p>
              <p>
                <strong>Verified At:</strong> {new Date().toLocaleString()}
              </p>
              {geo.lat !== null && (
                <p>
                  <strong>Location:</strong> {geo.lat.toFixed(4)},{" "}
                  {geo.lng!.toFixed(4)}
                </p>
              )}
            </div>
            <div className="text-2xl font-bold text-emerald-600 border-2 border-emerald-600 inline-block px-6 py-2">
              VERIFIED GENUINE
            </div>
          </div>
        </div>

        {/* Screen view */}
        <div className="print:hidden">
          <header className="border-b bg-card/80 backdrop-blur-xl">
            <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
              <Link to="/" className="flex items-center gap-2">
                <img src="/apas.png" alt="AuthentiChain Logo" className="w-8 h-8 object-contain rounded-sm" />
                <span className="font-bold text-sm">AuthentiChain</span>
              </Link>
              <span className="text-muted-foreground text-sm ml-auto">
                Verification Result
              </span>
            </div>
          </header>

          <main className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 py-8 space-y-4">
            <div className="text-center py-6">
              <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-3" />
              <h1 className="text-2xl font-bold text-foreground mb-1">Authentic</h1>
              <p className="text-muted-foreground mb-1">{result.message}</p>
              <p className="text-muted-foreground/60 text-sm">
                Scanned {result.scan_count || 1} time
                {(result.scan_count || 1) > 1 ? "s" : ""}
              </p>
            </div>

            {/* Trust Score */}
            <div className="rounded-lg p-4 border bg-card">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-sm text-muted-foreground">
                  Trust Score
                </h3>
                <span className={`text-sm font-semibold ${trustColor}`}>
                  {trustScore}/100 — {trustLabel}
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-full rounded-full ${trustBarColor}`}
                  style={{ width: `${Math.max(0, Math.min(100, trustScore))}%` }}
                />
              </div>
            </div>

            {/* Scan Location */}
            <div className="rounded-lg p-4 border bg-card">
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${
                    geo.lat !== null ? "bg-emerald-100" : "bg-muted"
                  }`}
                >
                  <MapPin
                    className={`w-4 h-4 ${
                      geo.lat !== null ? "text-emerald-600" : "text-muted-foreground"
                    }`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Scan Location</p>
                  {geo.lat !== null ? (
                    <p className="text-xs text-muted-foreground font-mono">
                      {geo.lat.toFixed(6)}, {geo.lng!.toFixed(6)}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Location not available
                    </p>
                  )}
                </div>
                {geo.lat !== null && (
                  <a
                    href={`https://www.google.com/maps?q=${geo.lat},${geo.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    View Map <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>

            {/* Blockchain */}
            {prod.blockchain_tx && (
              <div className="rounded-lg p-4 border bg-card">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-emerald-100 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Anchored on Sepolia</p>
                    <a
                      href={`https://sepolia.etherscan.io/tx/${prod.blockchain_tx}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 font-mono truncate"
                    >
                      {prod.blockchain_tx.substring(0, 18)}...
                      {prod.blockchain_tx.substring(
                        prod.blockchain_tx.length - 8
                      )}
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Hash Chain */}
            <div className="rounded-lg p-4 border bg-card">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium">
                    Hash Chain Integrity: Verified
                  </p>
                  <p className="text-xs text-muted-foreground">
                    All supply chain records are tamper-resistant.
                  </p>
                </div>
              </div>
            </div>

            {/* Product Details */}
            <div className="rounded-lg p-5 border bg-card">
              <h3 className="font-medium mb-3">Product Details</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Name", value: prod.name },
                  { label: "Brand", value: prod.brand },
                  { label: "Code", value: prod.product_code },
                  { label: "Category", value: prod.category || "N/A" },
                  { label: "Origin", value: prod.origin_country || "N/A" },
                  { label: "Status", value: prod.status || "active" },
                  {
                    label: "Manufactured",
                    value: prod.manufacture_date
                      ? new Date(prod.manufacture_date).toLocaleDateString()
                      : "N/A",
                  },
                  {
                    label: "Expiry",
                    value: prod.expiry_date
                      ? new Date(prod.expiry_date).toLocaleDateString()
                      : "N/A",
                  },
                ].map((f) => (
                  <div key={f.label}>
                    <p className="text-xs text-muted-foreground">{f.label}</p>
                    <p className="text-sm font-medium">{f.value}</p>
                  </div>
                ))}
              </div>
              {prod.verification_hash && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs text-muted-foreground">
                    Verification Hash
                  </p>
                  <p className="text-xs font-mono text-muted-foreground/50 break-all">
                    {prod.verification_hash}
                  </p>
                </div>
              )}
            </div>

            {/* Supply Chain Timeline */}
            {events.length > 0 && (
              <div className="rounded-lg p-5 border bg-card">
                <h3 className="font-medium mb-3">Supply Chain Journey</h3>
                <SupplyChainTimeline events={events} />
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <div className="flex-1 md:w-auto w-full">
                <FlowButton
                  onClick={() => window.print()}
                  size="full"
                  text={<span className="flex items-center gap-1"><Printer className="w-4 h-4" /> Print Certificate</span>}
                />
              </div>
              <div className="flex-1 md:w-auto w-full">
                <FlowButton 
                  onClick={resetVerification} 
                  size="full"
                  text={<span className="flex items-center gap-1"><RotateCcw className="w-4 h-4" /> Scan Another</span>} 
                />
              </div>
            </div>
          </main>
        </div>
        <AppFooter />
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // VIEW: SCANNING (default)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b bg-card/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2">
              <img src="/apas.png" alt="AuthentiChain Logo" className="w-8 h-8 object-contain rounded-sm" />
            <span className="font-bold text-sm">AuthentiChain</span>
          </Link>
          {/* Live geo badge in header */}
          <div className="ml-auto">
            <GeoStatusBadge />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-4 sm:px-6 py-8">
        <div className="text-center mb-8">
          <img src="/apas.png" alt="AuthentiChain Logo" className="w-12 h-12 object-contain mx-auto mb-3 rounded-sm bg-primary/10 p-1" />
          <h1 className="text-2xl font-bold text-foreground mb-1">
            Verify Product
          </h1>
          <p className="text-muted-foreground text-sm">
            Scan a QR code or enter a product code
          </p>
        </div>

        {/* Camera / Scanner area */}
        <div className="mb-6">
          <div
            className={`relative rounded-lg overflow-hidden border transition-colors ${
              cameraActive
                ? "border-primary/30 bg-black"
                : "border-border bg-muted/30"
            }`}
            style={{ minHeight: "350px" }}
          >
            {/*
              CRITICAL: Always in DOM, always visible, never hidden.
              html5-qrcode needs this div to have real dimensions.
            */}
            <div
              id="qr-reader"
              style={{ width: "100%", minHeight: "350px", position: "relative" }}
            />

            {/* Scanning badge */}
            {cameraActive && (
              <div className="absolute top-3 left-0 right-0 text-center pointer-events-none z-20">
                <span className="inline-flex items-center gap-1.5 bg-black/60 text-blue-300 text-xs px-3 py-1.5 rounded-full">
                  <ScanLine className="w-3 h-3 animate-pulse" />
                  Scanning — hold QR steady
                </span>
              </div>
            )}

            {/* Idle placeholder overlay */}
            {!cameraActive && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/30 z-10">
                <div className="text-center max-w-sm px-4">
                  <Camera className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm mb-4">
                    Point your camera at a QR code
                  </p>
                  <div className="flex justify-center mt-2">
                    <FlowButton onClick={startCamera} size="sm" text={<span className="flex items-center gap-1"><Camera className="w-4 h-4" /> Open Camera</span>} />
                  </div>
                  {cameraError && (
                    <p className="text-xs text-destructive mt-3 px-2">
                      {cameraError}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Stop camera button */}
            {cameraActive && (
              <div className="absolute bottom-3 left-0 right-0 text-center z-20">
                <div className="flex justify-center">
                  <FlowButton 
                    onClick={() => stopCamera()} 
                    size="sm" 
                    text={<span className="flex items-center gap-1"><CameraOff className="w-4 h-4" /> Stop Camera</span>} 
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-border" />
          <span className="text-muted-foreground text-xs font-medium uppercase">
            or enter manually
          </span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Manual input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            log("manual form submitted, query:", query);
            // Kick off geo on manual submit if not yet requested
            if (geoRef.current.status === "idle") requestGeo();
            handleVerify();
          }}
          className="flex gap-2 mb-8"
        >
          <Input
            placeholder="Product code or token"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1"
          />
          <div className="flex-shrink-0">
            <FlowButton type="submit" size="sm" text={<span className="flex items-center gap-1"><Search className="w-4 h-4" /> Verify</span>} />
          </div>
        </form>

        {/* How it works */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
          {[
            { icon: "📷", label: "Scan QR", desc: "Point camera at code" },
            { icon: "🔍", label: "Verify", desc: "Instant security checks" },
            { icon: "✅", label: "Result", desc: "Authentic or counterfeit" },
          ].map((s) => (
            <div key={s.label} className="p-4 rounded-lg border bg-card">
              <div className="text-xl mb-1">{s.icon}</div>
              <p className="text-sm font-medium">{s.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
            </div>
          ))}
        </div>
      </main>

      <AppFooter />
    </div>
  );
}