import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { FlowButton } from "@/components/ui/flow-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateEventHash } from "@/lib/hash";
import { Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ScanUpdate() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [productCode, setProductCode] = useState("");
  const [eventType, setEventType] = useState("in_transit");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { document.title = "Scan & Update — AuthentiChain"; }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    let { data: product } = await supabase.from("products").select("id, product_code").eq("product_code", productCode).maybeSingle();
    if (!product) {
      const res = await supabase.from("products").select("id, product_code").eq("qr_data", productCode).maybeSingle();
      product = res.data;
    }

    if (!product) {
      toast({ title: "Product not found", variant: "destructive" });
      setLoading(false);
      return;
    }

    const { data: lastEvent } = await supabase.from("supply_chain_events").select("event_hash, event_type").eq("product_id", product.id).order("created_at", { ascending: false }).limit(1).maybeSingle();

    const ts = new Date().toISOString();
    const eventHash = generateEventHash({
      productId: product.id, eventType, actorId: user!.id, timestamp: ts,
      previousHash: lastEvent?.event_hash,
    });

    // Fraud detection: invalid sequence
    if (lastEvent) {
      const validSequences: Record<string, string[]> = {
        manufactured: ["shipped", "in_transit"],
        shipped: ["in_transit", "received"],
        in_transit: ["received", "delivered"],
        received: ["shipped", "in_transit", "delivered", "sold"],
        delivered: ["sold"],
      };
      if (validSequences[lastEvent.event_type] && !validSequences[lastEvent.event_type].includes(eventType)) {
        await supabase.from("fraud_alerts").insert({
          product_id: product.id, alert_type: "invalid_sequence", severity: "high",
          description: `Invalid event sequence: ${lastEvent.event_type} → ${eventType} for product ${product.product_code}`,
        });
        await supabase.from("products").update({ is_flagged: true, flag_reason: "Invalid supply chain event sequence" }).eq("id", product.id);
      }
    }

    const { error } = await supabase.from("supply_chain_events").insert({
      product_id: product.id, actor_id: user!.id, event_type: eventType,
      location: location || null, notes: notes || null,
      previous_event_hash: lastEvent?.event_hash || null, event_hash: eventHash,
    });

    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else {
      toast({ title: "Event recorded", description: `${eventType} event added for ${product.product_code}` });
      setProductCode(""); setLocation(""); setNotes("");
    }
    setLoading(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-lg">
        <div>
          <h1 className="text-2xl font-bold">Scan & Update</h1>
          <p className="text-sm text-muted-foreground mt-1">Scan a product QR code and update its supply chain status</p>
        </div>

        <div className="bg-card rounded-xl border border-border p-6 shadow-card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Product Code / QR Data *</Label>
              <Input value={productCode} onChange={(e) => setProductCode(e.target.value)} required placeholder="PRD-XXXXXXXX" />
            </div>
            <div>
              <Label>Event Type *</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_transit">In Transit</SelectItem>
                  <SelectItem value="received">Received</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="shipped">Shipped</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Location</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, Country" />
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." />
            </div>
              <FlowButton 
                type="submit" 
                size="full" 
                disabled={loading} 
                text={<span className="flex items-center gap-1"><Send className="w-4 h-4" /> {loading ? "Recording..." : "Record Event"}</span>} 
              />
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}
