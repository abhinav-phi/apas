import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatusBadge } from "@/components/ui/status-badge";
import { Package, Shield } from "lucide-react";

export default function MyProducts() {
  const { user } = useAuth();
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    document.title = "My Products — AuthentiChain";
    supabase.from("ownership_transfers").select("*, products(*)").eq("to_user_id", user!.id).order("created_at", { ascending: false }).then(({ data }) => {
      if (data) setProducts(data.map((t: any) => t.products).filter(Boolean));
    });
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">My Products</h1>
          <p className="text-sm text-muted-foreground mt-1">Products you own or have verified</p>
        </div>

        {products.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-xl border border-border">
            <Package className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No products in your collection yet</p>
            <p className="text-xs text-muted-foreground mt-1">Verify a product to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {products.map((p: any) => (
              <div key={p.id} className="bg-card rounded-xl border border-border p-5 shadow-card">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center shrink-0">
                    <Shield className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.brand} · {p.product_code}</p>
                    <StatusBadge status={p.is_flagged ? "suspicious" : "genuine"} className="mt-2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
