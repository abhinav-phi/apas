import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { FlowButton } from "@/components/ui/flow-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { generateEventHash } from "@/lib/hash";
import { Send, QrCode, X, MapPin, CheckCircle2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Html5Qrcode } from "html5-qrcode";

const VALID_SEQUENCES: Record<string, string[]> = {
  manufactured: ["shipped", "in_transit"],
  shipped: ["in_transit", "received"],
  in_transit: ["received", "delivered"],
  received: ["shipped", "in_transit", "delivered", "sold"],
  delivered: ["sold"],
};

const EVENT_LABELS: Record<string, string> = {
  in_transit: "In Transit",
  received: "Received",
  delivered: "Delivered",
  shipped: "Shipped",
};

export default function ScanUpdate() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [productCode, setProductCode] = useState("");
  const [eventType, setEventType] = useState("in_transit");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scanDivId = "sc-qr-scanner";

  useEffect(() => {
    document.title = "Scan & Update — AuthentiChain";
    return () => {
      stopScanner();
    };
  }, []);

  const startScanner = async () => {
    setScanning(true);
    try {
      const scanner = new Html5Qrcode(scanDivId);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 12, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          // Extract product code from verify URL if needed
          let code = decodedText;
          try {
            const url = new URL(decodedText);
            const qp = url.searchParams.get("code");
            if (qp) code = qp;
          } catch {
            // not a URL, use as-is
          }
          setProductCode(code);
          stopScanner();
          toast({ title: "QR scanned", description: `Code: ${code}` });
        },
        undefined
      );
    } catch (err: unknown) {
      setScanning(false);
      toast({ title: "Camera error", description: (err as Error).message || "Could not access camera", variant: "destructive" });
    }
  };

  const stopScanner = () => {
    const scanner = scannerRef.current;
    if (scanner) {
      scanner.stop().catch(() => {}).finally(() => {
        scanner.clear();
        scannerRef.current = null;
        setScanning(false);
      });
    } else {
      setScanning(false);
    }
  };

  const detectLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: "Geolocation not supported", variant: "destructive" });
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setLocation(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
        setGeoLoading(false);
        toast({ title: "Location detected", description: `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}` });
      },
      (err) => {
        setGeoLoading(false);
        toast({ title: "Location error", description: err.message, variant: "destructive" });
      },
      { timeout: 10000 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSuccess(false);

    let product = null;
    const { data: p1 } = await supabase.from("products").select("id, product_code").eq("product_code", productCode.trim()).maybeSingle();
    product = p1;
    if (!product) {
      const { data: p2 } = await supabase.from("products").select("id, product_code").eq("qr_data", productCode.trim()).maybeSingle();
      product = p2;
    }

    if (!product) {
      toast({ title: "Product not found", description: `No product with code "${productCode}"`, variant: "destructive" });
      setLoading(false);
      return;
    }

    const { data: lastEvent } = await supabase
      .from("supply_chain_events")
      .select("event_hash, event_type")
      .eq("product_id", product.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const ts = new Date().toISOString();
    const eventHash = generateEventHash({
      productId: product.id,
      eventType,
      actorId: user!.id,
      timestamp: ts,
      previousHash: lastEvent?.event_hash,
    });

    // Sequence validation
    if (lastEvent && VALID_SEQUENCES[lastEvent.event_type] && !VALID_SEQUENCES[lastEvent.event_type].includes(eventType)) {
      await supabase.from("fraud_alerts").insert({
        product_id: product.id,
        alert_type: "invalid_sequence",
        severity: "high",
        description: `Invalid event sequence: ${lastEvent.event_type} → ${eventType} for ${product.product_code}`,
      });
      await supabase.from("products").update({ is_flagged: true, flag_reason: "Invalid supply chain event sequence" }).eq("id", product.id);
      toast({
        title: "⚠️ Sequence Warning",
        description: `${lastEvent.event_type} → ${eventType} is not a valid transition. Alert raised.`,
        variant: "destructive",
      });
    }

    const { error } = await supabase.from("supply_chain_events").insert({
      product_id: product.id,
      actor_id: user!.id,
      event_type: eventType,
      location: location || null,
      notes: notes || null,
      latitude: lat,
      longitude: lng,
      previous_event_hash: lastEvent?.event_hash || null,
      event_hash: eventHash,
    });

    if (error) {
      toast({ title: "Error recording event", description: error.message, variant: "destructive" });
    } else {
      setSuccess(true);
      toast({ title: "✓ Event recorded", description: `${EVENT_LABELS[eventType] || eventType} event added for ${product.product_code}` });
      setProductCode("");
      setLocation("");
      setNotes("");
      setLat(null);
      setLng(null);
      setTimeout(() => setSuccess(false), 4000);
    }
    setLoading(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-lg">
        <div>
          <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "#71ffe8", fontFamily: "IBM Plex Mono, monospace" }}>Supplier</p>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: "#dfe2eb" }}>Scan & Update</h1>
          <p className="text-sm mt-1" style={{ color: "#849490" }}>Scan a product QR code to record a supply chain event</p>
        </div>

        {/* QR Scanner */}
        {scanning ? (
          <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <p className="text-sm font-semibold" style={{ color: "#dfe2eb" }}>Scanning QR Code...</p>
              <Button variant="ghost" size="sm" onClick={stopScanner} className="gap-1">
                <X className="w-4 h-4" /> Cancel
              </Button>
            </div>
            <div id={scanDivId} className="w-full" style={{ minHeight: "280px" }} />
            <p className="text-xs text-center p-3" style={{ color: "#849490" }}>Point camera at product QR code</p>
          </div>
        ) : (
          <Button
            variant="outline"
            className="w-full gap-2 h-11"
            onClick={startScanner}
          >
            <QrCode className="w-4 h-4" style={{ color: "#71ffe8" }} />
            Scan QR Code with Camera
          </Button>
        )}

        {/* Form */}
        <div className="bg-card rounded-xl border border-border p-6 shadow-card">
          {success && (
            <div className="flex items-center gap-2 p-3 rounded-lg mb-4" style={{ background: "rgba(113,255,232,0.08)", border: "1px solid rgba(113,255,232,0.2)" }}>
              <CheckCircle2 className="w-4 h-4" style={{ color: "#71ffe8" }} />
              <p className="text-sm font-medium" style={{ color: "#71ffe8" }}>Event recorded successfully!</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-xs mb-1.5 block" style={{ color: "#849490" }}>Product Code *</Label>
              <Input
                value={productCode}
                onChange={(e) => setProductCode(e.target.value)}
                required
                placeholder="PRD-XXXXXXXX"
                style={{ fontFamily: "IBM Plex Mono, monospace" }}
              />
              <p className="text-xs mt-1" style={{ color: "#5a6a66" }}>Scan QR above or type manually</p>
            </div>

            <div>
              <Label className="text-xs mb-1.5 block" style={{ color: "#849490" }}>Event Type *</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="shipped">Shipped</SelectItem>
                  <SelectItem value="in_transit">In Transit</SelectItem>
                  <SelectItem value="received">Received</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-xs" style={{ color: "#849490" }}>Location</Label>
                <Button type="button" variant="ghost" size="sm" onClick={detectLocation} disabled={geoLoading} className="h-6 text-xs gap-1 px-2">
                  {geoLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <MapPin className="w-3 h-3" style={{ color: "#71ffe8" }} />}
                  Auto-detect GPS
                </Button>
              </div>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="City, Country or auto-detected coordinates"
              />
            </div>

            <div>
              <Label className="text-xs mb-1.5 block" style={{ color: "#849490" }}>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes about this event..."
                rows={2}
                className="resize-none"
              />
            </div>

            <FlowButton
              type="submit"
              size="full"
              disabled={loading || !productCode}
              text={
                <span className="flex items-center gap-1.5">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {loading ? "Recording..." : "Record Event"}
                </span>
              }
            />
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}
