import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { QRCodeSVG } from "qrcode.react";
import { Package, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function QRCodes() {
  const { user } = useAuth();
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    document.title = "QR Codes — AuthentiChain";
    const fetch = async () => {
      const { data } = await supabase.from("products").select("id, name, product_code, qr_data, brand, secure_token").eq("manufacturer_id", user!.id).order("created_at", { ascending: false });
      if (data) setProducts(data);
    };
    fetch();
  }, []);

  const downloadQR = (productCode: string) => {
    const svg = document.getElementById(`qr-${productCode}`);
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 256, 256);
      ctx.drawImage(img, 0, 0, 256, 256);
      URL.revokeObjectURL(url);
      const a = document.createElement("a");
      a.download = `${productCode}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    };
    img.src = url;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">QR Codes</h1>
          <p className="text-sm text-muted-foreground mt-1">Generate and manage product QR codes</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p) => (
            <div key={p.id} className="bg-card rounded-xl border border-border p-5 shadow-card text-center">
              <div className="inline-block p-4 bg-background rounded-lg border border-border mb-3">
                <QRCodeSVG id={`qr-${p.product_code}`} value={`${window.location.origin}/verify?token=${p.secure_token}`} size={160} level="H" />
              </div>
              <p className="text-sm font-semibold">{p.name}</p>
              <p className="text-xs text-muted-foreground font-mono">{p.product_code}</p>
              <p className="text-xs text-muted-foreground">{p.brand}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => downloadQR(p.product_code)}>
                <Download className="w-3 h-3 mr-1" /> Download
              </Button>
            </div>
          ))}
          {products.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-sm">No products registered yet</p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
