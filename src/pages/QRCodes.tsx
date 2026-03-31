import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { QRCodeCanvas } from "qrcode.react";
import { Package, Download, Copy, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function QRCodes() {
  const { user } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    document.title = "QR Codes — AuthentiChain";
    const fetchProducts = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("products")
        .select("id, name, product_code, brand")
        .eq("manufacturer_id", user!.id)
        .order("created_at", { ascending: false });
      if (data) setProducts(data);
      setLoading(false);
    };
    fetchProducts();
  }, [user]);

  const downloadQR = (productCode: string, productName: string) => {
    const canvas = document.getElementById(
      `qr-${productCode}`
    ) as HTMLCanvasElement | null;
    if (!canvas) return;

    // Create a new canvas with padding and label
    const exportCanvas = document.createElement("canvas");
    const padding = 32;
    const labelHeight = 48;
    exportCanvas.width = canvas.width + padding * 2;
    exportCanvas.height = canvas.height + padding * 2 + labelHeight;

    const ctx = exportCanvas.getContext("2d")!;

    // White background
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    // Draw QR code centered with padding
    ctx.drawImage(canvas, padding, padding);

    // Draw product code below QR
    ctx.fillStyle = "#000000";
    ctx.font = "bold 16px monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      productCode,
      exportCanvas.width / 2,
      canvas.height + padding + 24
    );

    // Draw product name smaller
    ctx.fillStyle = "#666666";
    ctx.font = "12px sans-serif";
    ctx.fillText(
      productName,
      exportCanvas.width / 2,
      canvas.height + padding + 42
    );

    // Download
    const a = document.createElement("a");
    a.download = `QR-${productCode}.png`;
    a.href = exportCanvas.toDataURL("image/png", 1.0);
    a.click();
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopiedId(code);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">QR Codes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate and manage product QR codes
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="bg-card rounded-xl border border-border p-5 shadow-sm text-center"
              >
                <Skeleton className="w-[200px] h-[200px] mx-auto rounded-lg mb-3" />
                <Skeleton className="h-5 w-3/4 mx-auto mb-2" />
                <Skeleton className="h-4 w-1/2 mx-auto mb-2" />
                <Skeleton className="h-3 w-1/3 mx-auto mt-3" />
              </div>
            ))
          ) : (
            <>
              {products.map((p) => (
                <div
                  key={p.id}
                  className="bg-card rounded-xl border border-border p-5 shadow-sm text-center"
                >
                  {/* QR Code — pure black on white, product_code ONLY */}
                  <div className="inline-block p-4 bg-white rounded-lg border border-border mb-3">
                    <QRCodeCanvas
                      id={`qr-${p.product_code}`}
                      value={p.product_code}
                      size={220}
                      level="H"
                      bgColor="#FFFFFF"
                      fgColor="#000000"
                      marginSize={3}
                      style={{ imageRendering: "pixelated" }}
                    />
                  </div>

                  {/* Product info */}
                  <p className="text-sm font-semibold text-foreground">
                    {p.name}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5 tracking-wider">
                    {p.product_code}
                  </p>
                  <p className="text-xs text-muted-foreground">{p.brand}</p>

                  {/* Actions */}
                  <div className="flex gap-2 mt-3 justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadQR(p.product_code, p.name)}
                    >
                      <Download className="w-3 h-3 mr-1" /> Download
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyCode(p.product_code)}
                    >
                      {copiedId === p.product_code ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-500" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 mr-1" /> Code
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))}

              {products.length === 0 && (
                <div className="col-span-full text-center py-12 text-muted-foreground">
                  <Package className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-sm">No products registered yet</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}