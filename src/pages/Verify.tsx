import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SupplyChainTimeline } from "@/components/ui/timeline";
import { FlowButton } from "@/components/ui/flow-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Shield,
  MapPin,
  Search,
  AlertTriangle,
  ExternalLink,
  Clock,
  CheckCircle2,
  CameraOff,
  ScanLine,
  Download,
  XCircle,
  ShieldCheck,
  ShieldAlert,
  Camera,
  Printer,
  Loader2,
  RotateCcw,
  WifiOff,
} from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { generateProductCertificate } from "@/lib/pdf";
import { AppFooter } from "@/components/layout/AppFooter";
import { OnChainProof } from "@/components/OnChainProof";
import type { Tables } from "@/integrations/supabase/types";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return String(err);
}

type VerifyResult = {
  valid: boolean;
  type: "GENUINE" | "CLONE" | "TAMPERED" | "NOT_FOUND" | "RECALLED" | "EXPIRED" | "SUSPENDED" | "RATE_LIMITED";
  message: string;
  scan_count?: number;
  trust_score?: number;
  hash_chain_valid?: boolean;
  first_scanned_at?: string;
  recalled_at?: string;
  events?: Tables<"supply_chain_events">[];
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
    blockchain_tx_status?: string | null;
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

type ViewState = "scanning" | "verifying" | "genuine" | "fake" | "offline";

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
    case "RECALLED":
      return {
        title: "Product Recalled",
        subtitle:
          "This product has been recalled by the manufacturer. Do not use or consume it.",
        icon: AlertTriangle,
      };
    case "EXPIRED":
      return {
        title: "Product Expired",
        subtitle:
          "This product has passed its expiry date. Do not consume or rely on it.",
        icon: Clock,
      };
    case "SUSPENDED":
      return {
        title: "Product Suspended",
        subtitle:
          "This product is currently under review. Verification is temporarily unavailable.",
        icon: ShieldAlert,
      };
    case "RATE_LIMITED":
      return {
        title: "Too Many Attempts",
        subtitle:
          "Verification rate limit reached from this device. Please wait a minute and try again.",
        icon: Clock,
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
  promise: PromiseLike<T>,
  ms: number,
  label: string
): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
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
  // PWA 4.7: code waiting to be verified once connectivity returns
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [events, setEvents] = useState<Tables<"supply_chain_events">[]>([]);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [geo, setGeo] = useState<GeoInfo>({
    status: "idle",
    lat: null,
    lng: null,
  });

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const hasScannedRef = useRef(false);
  const isVerifyingRef = useRef(false);
  const handleVerifyRef = useRef<(input?: string) => Promise<void>>();
  const geoRef = useRef<GeoInfo>({ status: "idle", lat: null, lng: null });
  const [troubleNudge, setTroubleNudge] = useState(false);
  const nudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearNudgeTimer = useCallback(() => {
    if (nudgeTimerRef.current) {
      clearTimeout(nudgeTimerRef.current);
      nudgeTimerRef.current = null;
    }
    setTroubleNudge(false);
  }, []);

  const log = (...args: unknown[]) => { if (import.meta.env.DEV) console.log("[Verify]", ...args); };

  // Keep geoRef in sync with state
  useEffect(() => {
    geoRef.current = geo;
  }, [geo]);

  /* ───────── STOP CAMERA ───────── */
  const stopCamera = useCallback(async () => {
    log("stopCamera called, scannerRef exists:", !!scannerRef.current);
    clearNudgeTimer();
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
    } catch (e: unknown) {
      log("stop error (safe to ignore):", errorMessage(e));
    }
    try {
      inst.clear();
      log("scanner cleared OK");
    } catch (e: unknown) {
      log("clear error (safe to ignore):", errorMessage(e));
    }
  }, [clearNudgeTimer]);

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

      // PWA 4.7: never render a verdict while offline. Queue the scanned code
      // and show an honest "will verify once online" state instead of a
      // misleading verification failure (and never a false genuine/fake call).
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setPendingCode(q);
        setViewState("offline");
        return;
      }

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

        // Journey timeline ships with the RPC result (no direct table reads)
        setEvents(res.events ?? []);
      } catch (err: unknown) {
        console.error("Verification error:", err);
        const msg = errorMessage(err);
        setResult({
          valid: false,
          type: "NOT_FOUND",
          message:
            msg === "RPC timeout"
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

  // PWA 4.7: when connectivity returns, automatically flush any queued scan.
  useEffect(() => {
    const onOnline = () => {
      if (!pendingCode) return;
      const code = pendingCode;
      setPendingCode(null);
      handleVerifyRef.current?.(code);
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [pendingCode]);

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
      log("initializing html5-qrcode...");

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
                try { inst.clear(); } catch { /* ignore */ }
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

      // Nudge if no QR detected within ~20s (camera stays open) — AppFlow §4.2
      clearNudgeTimer();
      nudgeTimerRef.current = setTimeout(() => {
        if (!hasScannedRef.current && scannerRef.current) {
          setTroubleNudge(true);
        }
      }, 20000);

      // ✅ Request geo AFTER camera is live to avoid permission dialog conflict
      // Small delay so camera permission dialog doesn't overlap geo dialog
      if (geoRef.current.status === "idle") {
        setTimeout(() => {
          log("requesting geo after camera settled");
          requestGeo();
        }, 1500);
      }
    } catch (err: unknown) {
      log("CAMERA ERROR:", errorMessage(err));
      console.error("Full camera error:", err);

      const inst = scannerRef.current;
      scannerRef.current = null;
      setCameraActive(false);
      if (inst) {
        try { inst.clear(); } catch { /* ignore */ }
      }

      // User-friendly error messages
      let msg = "Could not start camera.";
      const errMsg = errorMessage(err).toLowerCase();
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
  }, [clearNudgeTimer, stopCamera, requestGeo]);

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
    clearNudgeTimer();
    await stopCamera();
    setViewState("scanning");
    setResult(null);
    setEvents([]);
    setQuery("");
    setCameraError(null);
  }, [clearNudgeTimer, stopCamera]);

  /* ───────── DERIVED VALUES ───────── */
  const trustScore = result?.trust_score ?? result?.product?.trust_score ?? 0;
  const trustLabel =
    trustScore >= 80 ? "High Trust" : trustScore >= 50 ? "Medium Trust" : "Low Trust";
  const trustColor =
    trustScore >= 80
      ? "#71ffe8"
      : trustScore >= 50
      ? "#f9bc48"
      : "#ffb4ab";
  const trustBarColor =
    trustScore >= 80
      ? "#71ffe8"
      : trustScore >= 50
      ? "#f9bc48"
      : "#ffb4ab";

  /* ───────── GEO STATUS BADGE ───────── */
  const GeoStatusBadge = () => {
    if (geo.status === "granted" && geo.lat !== null)
      return (
        <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full" style={{ color: "#71ffe8", background: "rgba(113,255,232,0.1)" }}>
          <MapPin className="w-3 h-3" />
          <span>
            {geo.lat.toFixed(4)}, {geo.lng!.toFixed(4)}
          </span>
        </div>
      );
    if (geo.status === "requesting")
      return (
        <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full" style={{ color: "#f9bc48", background: "rgba(249,188,72,0.1)" }}>
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Getting location...</span>
        </div>
      );
    if (geo.status === "denied")
      return (
        <button
          onClick={requestGeo}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full transition-colors"
          style={{ color: "#ffb4ab", background: "rgba(255,180,171,0.1)" }}
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
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center" style={{ background: "#10141a" }}>
        <div className="relative w-16 h-16 mb-6">
          <div className="absolute inset-0 rounded-full border-2 border-transparent animate-spin" style={{ borderColor: "#00e5cc", borderTopColor: "transparent" }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <Shield className="w-6 h-6" style={{ color: "#00e5cc" }} />
          </div>
        </div>
        <h1 className="text-xl font-semibold mb-1" style={{ color: "#dfe2eb" }}>
          Verifying product...
        </h1>
        <p className="text-sm mb-8" style={{ color: "#849490" }}>Running security checks</p>
        <div className="space-y-3 text-left max-w-xs">
          {["Status Check", "Clone Detection", "Geo-location Analysis", "Hash Chain Integrity"].map(
            (label) => (
              <div key={label} className="flex items-center gap-3 text-sm">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" style={{ color: "#00e5cc" }} />
                <span style={{ color: "#849490" }}>{label}</span>
              </div>
            )
          )}
        </div>
        {geo.lat !== null && (
          <div className="mt-6 flex items-center gap-1.5 text-xs" style={{ color: "#71ffe8" }}>
            <MapPin className="w-3 h-3" />
            <span>
              Location: {geo.lat.toFixed(4)}, {geo.lng!.toFixed(4)}
            </span>
          </div>
        )}
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // VIEW: OFFLINE (PWA 4.7 — queued, never a verdict)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (viewState === "offline") {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "#10141a" }}>
        <header className="border-b" style={{ background: "rgba(22,27,34,0.8)", borderColor: "rgba(113,255,232,0.1)" }}>
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2">
              <img src="/apas.png" alt="AuthentiChain Logo" className="w-8 h-8 object-contain rounded-sm" />
              <span className="font-bold text-sm" style={{ color: "#dfe2eb" }}>AuthentiChain</span>
            </Link>
          </div>
        </header>

        <div className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="text-center max-w-md w-full">
            <WifiOff className="w-16 h-16 mx-auto mb-4" style={{ color: "#849490" }} />
            <h1 className="text-2xl font-bold mb-2" style={{ color: "#dfe2eb" }}>
              Scanned — will verify once online
            </h1>
            <p className="mb-6" style={{ color: "#849490" }}>
              You're offline, so we can't reach the verification service yet. Your scan is queued and will
              verify automatically the moment your connection returns — we never show a pass or fail
              verdict without a live check.
            </p>
            {pendingCode && (
              <div className="rounded-lg p-4 mb-6 text-left border" style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(113,255,232,0.06)" }}>
                <p className="text-xs" style={{ color: "#849490" }}>Queued code</p>
                <p className="text-sm font-medium" style={{ color: "#71ffe8", fontFamily: "IBM Plex Mono, monospace" }}>{pendingCode}</p>
              </div>
            )}
            <div className="flex flex-col items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs" style={{ color: "#849490" }}>
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#f9bc48" }} />
                Waiting for connection…
              </span>
              <FlowButton
                onClick={() => { setPendingCode(null); handleVerifyRef.current?.(pendingCode ?? undefined); }}
                size="sm"
                text={<span className="flex items-center gap-1"><RotateCcw className="w-4 h-4" /> Try again</span>}
              />
            </div>
          </div>
        </div>
        <AppFooter />
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // VIEW: FAKE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (viewState === "fake") {
    const fakeInfo = getFakeLabel(result?.type);
    const FakeIcon = fakeInfo.icon;
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "#10141a" }}>
        <header className="border-b" style={{ background: "rgba(22,27,34,0.8)", borderColor: "rgba(113,255,232,0.1)", backdropFilter: "blur(24px)" }}>
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2">
              <img src="/apas.png" alt="AuthentiChain Logo" className="w-8 h-8 object-contain rounded-sm" />
              <span className="font-bold text-sm" style={{ color: "#dfe2eb" }}>AuthentiChain</span>
            </Link>
          </div>
        </header>

        <div className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="text-center max-w-md w-full">
            <FakeIcon className="w-16 h-16 mx-auto mb-4" style={{ color: "#ffb4ab" }} />
            <h1 className="text-2xl font-bold mb-2" style={{ color: "#dfe2eb" }}>
              {fakeInfo.title}
            </h1>
            {result?.message && (
              <p className="mb-6" style={{ color: "#849490" }}>{result.message}</p>
            )}
            {result?.product && (
              <div className="rounded-lg p-4 mb-6 text-left border" style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(113,255,232,0.06)" }}>
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
                    .filter((f): f is { label: string; value: string } => f !== null)
                    .map((f) => (
                      <div key={f.label}>
                        <p className="text-xs" style={{ color: "#849490" }}>{f.label}</p>
                        <p className="text-sm font-medium" style={{ color: "#dfe2eb" }}>{f.value}</p>
                      </div>
                    ))}
                </div>
              </div>
            )}
            {geo.lat !== null && (
              <div className="flex items-center justify-center gap-1.5 text-xs mb-4" style={{ color: "#849490" }}>
                <MapPin className="w-3 h-3" />
                <span>
                  Scanned from: {geo.lat.toFixed(4)}, {geo.lng!.toFixed(4)}
                </span>
              </div>
            )}
            <p className="text-sm mb-8 max-w-sm mx-auto" style={{ color: "#849490" }}>
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
      <div className="min-h-screen flex flex-col print:bg-white" style={{ background: "#10141a" }}>
        {/* Print-only certificate */}
        <div className="hidden print:block p-12">
          <div className="text-center border-2 px-10 py-10 max-w-lg mx-auto" style={{ borderColor: "#71ffe8" }}>
            <div className="text-xl font-bold mb-2" style={{ color: "#10141a" }}>AuthentiChain</div>
            <h1 className="text-2xl font-bold mt-6 mb-8" style={{ color: "#10141a" }}>
              CERTIFICATE OF AUTHENTICITY
            </h1>
            <div className="text-left space-y-2 mb-8" style={{ color: "#10141a" }}>
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
            <div className="text-2xl font-bold border-2 inline-block px-6 py-2" style={{ color: "#00b8a0", borderColor: "#00b8a0" }}>
              VERIFIED GENUINE
            </div>
          </div>
        </div>

        {/* Screen view */}
        <div className="print:hidden">
          <header className="border-b" style={{ background: "rgba(22,27,34,0.8)", borderColor: "rgba(113,255,232,0.1)", backdropFilter: "blur(24px)" }}>
            <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
              <Link to="/" className="flex items-center gap-2">
                <img src="/apas.png" alt="AuthentiChain Logo" className="w-8 h-8 object-contain rounded-sm" />
                <span className="font-bold text-sm" style={{ color: "#dfe2eb" }}>AuthentiChain</span>
              </Link>
              <span className="text-sm ml-auto" style={{ color: "#849490" }}>
                Verification Result
              </span>
            </div>
          </header>

          <main className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 py-8 space-y-4">
            <div className="text-center py-6">
              <CheckCircle2 className="w-14 h-14 mx-auto mb-3" style={{ color: "#71ffe8" }} />
              <h1 className="text-2xl font-bold mb-1" style={{ color: "#dfe2eb" }}>Authentic</h1>
              <p className="mb-1" style={{ color: "#849490" }}>{result.message}</p>
              <p className="text-sm mb-4" style={{ color: "rgba(132,148,144,0.6)" }}>
                Scanned {result.scan_count || 1} time
                {(result.scan_count || 1) > 1 ? "s" : ""}
              </p>
              <div className="flex justify-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="gap-2"
                  onClick={() => {
                    generateProductCertificate({
                      productName: prod.name,
                      brand: prod.brand,
                      productCode: prod.product_code,
                      category: prod.category ?? "general",
                      verificationHash: prod.verification_hash ?? "",
                      trustScore,
                      issueDate: new Date().toISOString()
                    });
                  }}
                >
                  <Download className="w-4 h-4" /> Download PDF Certificate
                </Button>
              </div>
            </div>

            {/* Trust Score */}
            <div className="rounded-lg p-4 border" style={{ background: "#161B22", borderColor: "rgba(113,255,232,0.1)" }}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-sm" style={{ color: "#849490" }}>
                  Trust Score
                </h3>
                <span className="text-sm font-semibold" style={{ color: trustColor }}>
                  {trustScore}/100 — {trustLabel}
                </span>
              </div>
              <div className="w-full overflow-hidden rounded-full h-2.5" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div
                  className={`h-full rounded-full`}
                  style={{ width: `${Math.max(0, Math.min(100, trustScore))}%`, background: trustBarColor }}
                />
              </div>
            </div>

            {/* Scan Location */}
            <div className="rounded-lg p-4 border" style={{ background: "#161B22", borderColor: "rgba(113,255,232,0.1)" }}>
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
                  style={
                    geo.lat !== null
                      ? { background: "rgba(113,255,232,0.1)" }
                      : { background: "rgba(255,255,255,0.04)" }
                  }
                >
                  <MapPin
                    className="w-4 h-4"
                    style={{ color: geo.lat !== null ? "#71ffe8" : "#849490" }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: "#dfe2eb" }}>Scan Location</p>
                  {geo.lat !== null ? (
                    <p className="text-xs font-mono" style={{ color: "#849490" }}>
                      {geo.lat.toFixed(6)}, {geo.lng!.toFixed(6)}
                    </p>
                  ) : (
                    <p className="text-xs" style={{ color: "#849490" }}>
                      Location not available
                    </p>
                  )}
                </div>
                {geo.lat !== null && (
                  <a
                    href={`https://www.google.com/maps?q=${geo.lat},${geo.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs hover:underline flex items-center gap-1"
                    style={{ color: "#00e5cc" }}
                  >
                    View Map <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>

            {/* Blockchain — real Sepolia anchor (Etherscan link only once confirmed) */}
            {prod.blockchain_tx && prod.blockchain_tx_status === "confirmed" && (
              <OnChainProof
                productId={prod.id}
                verificationHash={prod.verification_hash ?? ""}
                txHash={prod.blockchain_tx}
              />
            )}
            {prod.blockchain_tx && prod.blockchain_tx_status !== "confirmed" && (
              <div className="rounded-lg p-4 border bg-card">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md flex items-center justify-center shrink-0" style={{ background: "rgba(249,188,72,0.1)" }}>
                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#f9bc48" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {prod.blockchain_tx_status === "failed" ? "On-chain anchor failed" : "Anchor pending"}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono truncate" title={prod.blockchain_tx}>
                      {prod.blockchain_tx.substring(0, 24)}...
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                      {prod.blockchain_tx_status === "failed"
                        ? "The anchoring transaction reverted — no on-chain proof is shown."
                        : "Transaction submitted to Sepolia — proof appears once confirmed."}
                    </p>
                  </div>
                </div>
              </div>
            )}


            {/* Hash Chain */}
            <div className="rounded-lg p-4 border" style={{ background: "#161B22", borderColor: "rgba(113,255,232,0.1)" }}>
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 shrink-0" style={{ color: "#71ffe8" }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: "#dfe2eb" }}>
                    Hash Chain Integrity: Verified
                  </p>
                  <p className="text-xs" style={{ color: "#849490" }}>
                    All supply chain records are tamper-resistant.
                  </p>
                </div>
              </div>
            </div>

            {/* Product Details */}
            <div className="rounded-lg p-5 border" style={{ background: "#161B22", borderColor: "rgba(113,255,232,0.1)" }}>
              <h3 className="font-medium mb-3" style={{ color: "#dfe2eb" }}>Product Details</h3>
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
                    <p className="text-xs" style={{ color: "#849490" }}>{f.label}</p>
                    <p className="text-sm font-medium" style={{ color: "#dfe2eb" }}>{f.value}</p>
                  </div>
                ))}
              </div>
              {prod.verification_hash && (
                <div className="mt-4 pt-4 border-t" style={{ borderColor: "rgba(113,255,232,0.06)" }}>
                  <p className="text-xs" style={{ color: "#849490" }}>
                    Verification Hash
                  </p>
                  <p className="text-xs font-mono break-all" style={{ color: "rgba(132,148,144,0.5)" }}>
                    {prod.verification_hash}
                  </p>
                </div>
              )}
            </div>

            {/* Supply Chain Timeline */}
            {events.length > 0 && (
              <div className="rounded-lg p-5 border" style={{ background: "#161B22", borderColor: "rgba(113,255,232,0.1)" }}>
                <h3 className="font-medium mb-3" style={{ color: "#dfe2eb" }}>Supply Chain Journey</h3>
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
                <span className="inline-flex items-center gap-1.5 bg-black/60 text-xs px-3 py-1.5 rounded-full" style={{ color: "#71ffe8", fontFamily: "IBM Plex Mono, monospace" }}>
                  <ScanLine className="w-3 h-3 animate-pulse" />
                  Scanning — hold QR steady
                </span>
              </div>
            )}

            {/* Trouble-scanning nudge — camera stays open (AppFlow §4.2) */}
            {cameraActive && troubleNudge && (
              <div className="absolute top-12 left-0 right-0 text-center pointer-events-none z-20">
                <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
                  style={{
                    background: "rgba(249,188,72,0.15)",
                    color: "#f9bc48",
                    fontFamily: "IBM Plex Mono, monospace",
                  }}
                >
                  <AlertTriangle className="w-3 h-3" />
                  Having trouble? Enter the code manually below
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
            { icon: Camera, label: "Scan QR", desc: "Point camera at code" },
            { icon: Search, label: "Verify", desc: "Instant security checks" },
            { icon: CheckCircle2, label: "Result", desc: "Authentic or counterfeit" },
          ].map((s) => (
            <div key={s.label} className="p-4 rounded-lg border" style={{ background: "#161B22", borderColor: "rgba(113,255,232,0.1)" }}>
              <s.icon className="w-5 h-5 mx-auto mb-1" style={{ color: "#00e5cc" }} />
              <p className="text-sm font-medium" style={{ color: "#dfe2eb" }}>{s.label}</p>
              <p className="text-xs mt-0.5" style={{ color: "#849490" }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </main>

      <AppFooter />
    </div>
  );
}