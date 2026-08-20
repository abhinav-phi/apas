import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { SupplyChainTimeline } from "@/components/ui/timeline";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Truck, Map as MapIcon, List, Loader2 } from "lucide-react";
import { SupplyChainMap } from "@/components/ui/SupplyChainMap";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

export default function SupplyChain() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [products, setProducts] = useState<Pick<Tables<"products">, "id" | "name" | "product_code">[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [events, setEvents] = useState<Tables<"supply_chain_events">[]>([]);
  const [viewMode, setViewMode] = useState<"timeline" | "map">("timeline");
  const [loadingEvents, setLoadingEvents] = useState(false);

  const fetchProducts = useCallback(async () => {
    if (!user?.id) return;
    try {
      if (role === "supplier") {
        // Get only products this supplier has interacted with
        const { data: eventData, error: eventErr } = await supabase.from("supply_chain_events").select("product_id").eq("actor_id", user.id);
        if (eventErr) throw eventErr;
        if (eventData && eventData.length > 0) {
          const productIds = [...new Set(eventData.map(e => e.product_id))];
          const { data, error } = await supabase.from("products").select("id, name, product_code").in("id", productIds).order("created_at", { ascending: false });
          if (error) throw error;
          if (data) setProducts(data);
        } else {
          setProducts([]);
        }
      } else {
        const { data, error } = await supabase.from("products").select("id, name, product_code").order("created_at", { ascending: false });
        if (error) throw error;
        if (data) setProducts(data);
      }
    } catch (err) {
      toast({ title: "Could not load products", description: (err as Error).message, variant: "destructive" });
    }
  }, [user?.id, role, toast]);

  useEffect(() => {
    document.title = "Supply Chain — AuthentiChain";
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    if (!selectedProduct) { setEvents([]); setLoadingEvents(false); return; }
    setLoadingEvents(true);
    supabase.from("supply_chain_events").select("*").eq("product_id", selectedProduct).order("created_at", { ascending: true }).then(({ data, error }) => {
      if (error) {
        toast({ title: "Could not load events", description: error.message, variant: "destructive" });
      }
      if (data) setEvents(data);
      setLoadingEvents(false);
    });
  }, [selectedProduct, toast]);

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
          {loadingEvents ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
          ) : events.length > 0 ? (
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
