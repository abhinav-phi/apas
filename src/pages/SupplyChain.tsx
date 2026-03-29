import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { SupplyChainTimeline } from "@/components/ui/timeline";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Truck } from "lucide-react";

export default function SupplyChain() {
  const { user, role } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    document.title = "Supply Chain — AuthentiChain";
    const fetchProducts = async () => {
      if (role === "supplier") {
        // Get only products this supplier has interacted with
        const { data: eventData } = await supabase.from("supply_chain_events").select("product_id").eq("actor_id", user!.id);
        if (eventData && eventData.length > 0) {
          const productIds = [...new Set(eventData.map(e => e.product_id))];
          const { data } = await supabase.from("products").select("id, name, product_code").in("id", productIds).order("created_at", { ascending: false });
          if (data) setProducts(data);
        }
      } else {
        const { data } = await supabase.from("products").select("id, name, product_code").order("created_at", { ascending: false });
        if (data) setProducts(data);
      }
    };
    fetchProducts();
  }, []);

  useEffect(() => {
    if (!selectedProduct) { setEvents([]); return; }
    supabase.from("supply_chain_events").select("*").eq("product_id", selectedProduct).order("created_at", { ascending: true }).then(({ data }) => {
      if (data) setEvents(data);
    });
  }, [selectedProduct]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Supply Chain</h1>
          <p className="text-sm text-muted-foreground mt-1">Track product journey through the supply chain</p>
        </div>

        <div className="max-w-sm">
          <Select value={selectedProduct} onValueChange={setSelectedProduct}>
            <SelectTrigger><SelectValue placeholder="Select a product..." /></SelectTrigger>
            <SelectContent>
              {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.product_code})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="bg-card rounded-xl border border-border p-6 shadow-card">
          {events.length > 0 ? (
            <SupplyChainTimeline events={events} />
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Truck className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-sm">{selectedProduct ? "No events recorded yet" : "Select a product to view its supply chain"}</p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
