import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

type QrBox =
  | { width: number; height: number }
  | ((containerWidth: number) => { width: number; height: number });

interface UseQrScannerOptions {
  /** DOM id of the element html5-qrcode renders the camera into */
  containerId: string;
  /** Decode attempts per second — higher is snappier but burns more CPU */
  fps?: number;
  /** Fixed scan box, or computed from the container width for responsiveness */
  qrbox?: QrBox;
  /** Use the native BarcodeDetector when available — faster on Chrome/Android */
  useBarCodeDetectorIfSupported?: boolean;
  /**
   * Fired with the decoded payload. Return `false` to keep scanning (e.g. the
   * payload didn't extract to a usable code); anything else stops the camera.
   */
  onDecode: (decodedText: string) => boolean | void;
  /** Camera/start failures (permissions, missing container, hardware busy) */
  onError?: (message: string) => void;
}

/**
 * Shared html5-qrcode camera lifecycle (dedupes Verify + ScanUpdate, which each
 * grew their own ~80-line copy): instance management, optimistic start/stop, a
 * single-fire guard per session, container reset between sessions and unmount
 * cleanup — Rules R8, camera streams are always released.
 */
export function useQrScanner({
  containerId,
  fps = 12,
  qrbox = { width: 240, height: 240 },
  useBarCodeDetectorIfSupported = false,
  onDecode,
  onError,
}: UseQrScannerOptions) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const decodedRef = useRef(false);
  const activeRef = useRef(false);
  const [active, setActive] = useState(false);

  // Latest callbacks via refs so start/stop stay referentially stable and the
  // unmount cleanup can never capture a stale closure.
  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const stop = useCallback((): Promise<void> => {
    const inst = scannerRef.current;
    scannerRef.current = null;
    activeRef.current = false;
    setActive(false);
    if (!inst) return Promise.resolve();
    return inst
      .stop()
      .catch(() => {})
      .finally(() => {
        try {
          inst.clear();
        } catch {
          /* already cleared */
        }
      });
  }, []);

  const start = useCallback(async () => {
    if (scannerRef.current) await stop();
    const container = document.getElementById(containerId);
    if (!container) {
      onErrorRef.current?.("Scanner container not found. Please refresh.");
      return;
    }
    container.innerHTML = ""; // clear old scanner artifacts
    decodedRef.current = false;
    activeRef.current = true;
    setActive(true); // optimistic — the UI flips to "scanning" immediately

    try {
      const scanner = new Html5Qrcode(containerId, {
        verbose: false,
        useBarCodeDetectorIfSupported,
      });
      scannerRef.current = scanner;
      const box = typeof qrbox === "function" ? qrbox(container.offsetWidth || 320) : qrbox;

      await scanner.start(
        { facingMode: "environment" },
        { fps, qrbox: box, disableFlip: false },
        (decodedText: string) => {
          if (decodedRef.current) return; // one decode per session
          const code = decodedText.trim();
          if (!code) return; // empty read — keep scanning
          if (onDecodeRef.current?.(code) === false) return; // caller rejected it
          decodedRef.current = true;
          void stop(); // release the camera before the caller takes over
        },
        undefined // per-frame no-detection — intentionally silent
      );
    } catch (err: unknown) {
      const failed = scannerRef.current;
      scannerRef.current = null;
      activeRef.current = false;
      setActive(false);
      try {
        failed?.clear();
      } catch {
        /* ignore */
      }
      onErrorRef.current?.(err instanceof Error ? err.message : "Could not access camera");
    }
  }, [containerId, fps, qrbox, useBarCodeDetectorIfSupported, stop]);

  // Unmount cleanup — no leaked camera streams (R8)
  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  return { active, activeRef, start, stop };
}
