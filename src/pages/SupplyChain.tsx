import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { SupplyChainTimeline } from "@/components/ui/timeline";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Truck, Map as MapIcon, List } from "lucide-react";
import { SupplyChainMap } from "@/components/ui/SupplyChainMap";
import type { Tables } from "@/integrations/supabase/types";

export default function SupplyChain() {
  const { user, role } = useAuth();
  const [products, setProducts] = useState<Pick<Tables<"products">, "id" | "name" | "product_code">[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [events, setEvents] = useState<Tables<"supply_chain_events">[]>([]);
  const [viewMode, setViewMode] = useState<"timeline" | "map">("timeline");

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

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-sm w-full">
            <Select value={selectedProduct} onValueChange={setSelectedProduct}>
              <SelectTrigger><SelectValue placeholder="Select a product..." /></SelectTrigger>
              <SelectContent>
                {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.product_code})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex bg-muted/50 p-1 rounded-lg border border-border">
            <button
              onClick={() => setViewMode("timeline")}
              className={`flex items-center px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === "timeline" ? "bg-accent text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="w-3.5 h-3.5 mr-1.5" /> Timeline
            </button>
            <button
              onClick={() => setViewMode("map")}
              className={`flex items-center px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === "map" ? "bg-accent text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <MapIcon className="w-3.5 h-3.5 mr-1.5" /> Map View
            </button>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-6 shadow-card">
          {events.length > 0 ? (
            viewMode === "timeline" ? (
              <SupplyChainTimeline events={events} />
            ) : (
              <SupplyChainMap events={events} />
            )
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
