import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FlowButton } from "@/components/ui/flow-button";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge } from "@/components/ui/status-badge";
import { Send, ArrowRight, Package, Clock, CheckCircle2, RefreshCw } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Product = Pick<Tables<"products">, "id" | "name" | "product_code" | "brand" | "status" | "category" | "image_url" | "is_flagged">;

interface TransferRow {
  id: string;
  created_at: string;
  product_id: string;
  from_user_id: string | null;
  to_user_id: string;
  status: string;
  transfer_type: string;
  notes: string | null;
  transfer_hash: string;
  products: { name: string; product_code: string } | null;
}

const TRANSFER_TYPES = [
  { value: "manufacturer_to_supplier", label: "Manufacturer → Supplier" },
  { value: "supplier_to_customer",     label: "Supplier → Customer" },
  { value: "internal_transfer",        label: "Internal Transfer" },
];

export default function TransferOwnership() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [loadingProds, setLoadingProds] = useState(true);
  const [loadingTx, setLoadingTx] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    product_id: "",
    to_email: "",
    transfer_type: "manufacturer_to_supplier",
    notes: "",
  });

  const fetchProducts = useCallback(async () => {
    if (!user?.id) return;
    setLoadingProds(true);
    // Custody, not creation: a supplier must see products transferred TO them
    // (current_owner_id), a manufacturer sees products still in their custody.
    // Before this fix suppliers always saw "No active products found" (audit P1).
    const { data, error } = await supabase
      .from("products")
      .select("id, name, product_code, brand, status, category, image_url, is_flagged")
      .or(`current_owner_id.eq.${user.id},and(manufacturer_id.eq.${user.id},current_owner_id.is.null)`)
      .eq("status", "active")
      .order("created_at", { ascending: false });
    if (error) toast({ title: "Could not load products", description: error.message, variant: "destructive" });
    if (data) setProducts(data as Product[]);
    setLoadingProds(false);
  }, [user?.id, toast]);

  const fetchTransfers = useCallback(async () => {
    if (!user?.id) return;
    setLoadingTx(true);
    const { data, error } = await supabase
      .from("ownership_transfers")
      .select("*, products(name, product_code)")
      .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) toast({ title: "Could not load transfers", description: error.message, variant: "destructive" });
    if (data) setTransfers(data as unknown as TransferRow[]);
    setLoadingTx(false);
  }, [user?.id, toast]);

  useEffect(() => {
    document.title = "Transfer Ownership — AuthentiChain";
    fetchProducts();
    fetchTransfers();
  }, [fetchProducts, fetchTransfers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.product_id || !form.to_email) return;
    setSubmitting(true);

    const { data, error } = await supabase.rpc("transfer_product_ownership", {
      p_product_id: form.product_id,
      p_to_email: form.to_email.trim().toLowerCase(),
      p_transfer_type: form.transfer_type,
      p_notes: form.notes || undefined,
    });

    if (error) {
      toast({ title: "Transfer failed", description: error.message, variant: "destructive" });
    } else {
      const result = data as { success: boolean; error?: string; message?: string; transfer_hash?: string };
      if (result.success) {
        toast({
          title: "✓ Transfer complete",
          description: `Product transferred. Hash: ${result.transfer_hash?.substring(0, 16)}...`,
        });
        setForm({ product_id: "", to_email: "", transfer_type: "manufacturer_to_supplier", notes: "" });
        fetchTransfers();
        fetchProducts();
      } else {
        toast({ title: "Transfer failed", description: result.error, variant: "destructive" });
      }
    }
    setSubmitting(false);
  };

  const selectedProduct = products.find(p => p.id === form.product_id);

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-2xl">
        {/* Header */}
        <div>
          <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "#71ffe8", fontFamily: "IBM Plex Mono, monospace" }}>Ownership</p>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: "#dfe2eb" }}>Transfer Ownership</h1>
          <p className="text-sm mt-1" style={{ color: "#849490" }}>
            Transfer product custody through the supply chain — manufacturer → supplier → customer
          </p>
        </div>

        {/* Transfer Form */}
        <div className="bg-card rounded-xl border border-border shadow-card p-6">
          <h2 className="text-sm font-semibold mb-5" style={{ color: "#dfe2eb" }}>New Transfer</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Product selector */}
            <div>
              <Label className="text-xs mb-1.5 block" style={{ color: "#849490" }}>Product *</Label>
              {loadingProds ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a product..." />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="flex items-center gap-2">
                          <span>{p.name}</span>
                          <span className="text-xs opacity-50 font-mono">{p.product_code}</span>
                        </span>
                      </SelectItem>
                    ))}
                    {products.length === 0 && (
                      <SelectItem value="__none__" disabled>No active products found</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Selected product preview */}
            {selectedProduct && (
              <div
                className="flex items-center gap-3 p-3 rounded-lg border"
                style={{ background: "rgba(113,255,232,0.04)", borderColor: "rgba(113,255,232,0.15)" }}
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(113,255,232,0.1)", color: "#71ffe8" }}>
                  <Package className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: "#dfe2eb" }}>{selectedProduct.name}</p>
                  <p className="text-xs font-mono" style={{ color: "#849490" }}>{selectedProduct.product_code} · {selectedProduct.brand}</p>
                </div>
                <StatusBadge status={selectedProduct.is_flagged ? "suspicious" : selectedProduct.status} />
              </div>
            )}

            {/* Transfer type */}
            <div>
              <Label className="text-xs mb-1.5 block" style={{ color: "#849490" }}>Transfer Type *</Label>
              <Select value={form.transfer_type} onValueChange={(v) => setForm({ ...form, transfer_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRANSFER_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Recipient email */}
            <div>
              <Label className="text-xs mb-1.5 block" style={{ color: "#849490" }}>Recipient Email *</Label>
              <Input
                type="email"
                value={form.to_email}
                onChange={(e) => setForm({ ...form, to_email: e.target.value })}
                required
                placeholder="recipient@example.com"
              />
              <p className="text-xs mt-1" style={{ color: "#7d8d88" }}>
                Recipient must have an AuthentiChain account
              </p>
            </div>

            {/* Notes */}
            <div>
              <Label className="text-xs mb-1.5 block" style={{ color: "#849490" }}>Notes (optional)</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Handoff notes, invoice number, etc."
                rows={2}
                className="resize-none"
              />
            </div>

            <FlowButton
              type="submit"
              size="full"
              disabled={submitting || !form.product_id || !form.to_email}
              text={
                <span className="flex items-center gap-1.5">
                  <Send className="w-4 h-4" />
                  {submitting ? "Transferring..." : "Transfer Product"}
                </span>
              }
            />
          </form>
        </div>

        {/* Transfer History */}
        <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between border-b border-border">
            <h2 className="text-sm font-semibold" style={{ color: "#dfe2eb" }}>Transfer History</h2>
            <Button variant="ghost" size="sm" onClick={() => { fetchTransfers(); }}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>

          {loadingTx ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
            </div>
          ) : transfers.length === 0 ? (
            <div className="py-12 text-center">
              <ArrowRight className="w-8 h-8 mx-auto mb-2" style={{ color: "rgba(132,148,144,0.3)" }} />
              <p className="text-sm" style={{ color: "#849490" }}>No transfers yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {transfers.map((tx) => {
                const isOutgoing = tx.from_user_id === user?.id;
                const typeLabel = TRANSFER_TYPES.find(t => t.value === tx.transfer_type)?.label || tx.transfer_type;
                return (
                  <div key={tx.id} className="flex items-start gap-3 p-5 hover:bg-muted/20 transition-colors">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: isOutgoing ? "rgba(249,188,72,0.1)" : "rgba(113,255,232,0.1)" }}
                    >
                      {isOutgoing
                        ? <Send className="w-3.5 h-3.5" style={{ color: "#f9bc48" }} />
                        : <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "#71ffe8" }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium" style={{ color: "#dfe2eb" }}>
                          {tx.products?.name || "—"}
                        </p>
                        <span className="text-xs font-mono" style={{ color: "#849490" }}>
                          {tx.products?.product_code}
                        </span>
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background: isOutgoing ? "rgba(249,188,72,0.1)" : "rgba(113,255,232,0.1)", color: isOutgoing ? "#f9bc48" : "#71ffe8" }}
                        >
                          {isOutgoing ? "SENT" : "RECEIVED"}
                        </span>
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: "#849490" }}>{typeLabel}</p>
                      {tx.notes && <p className="text-xs mt-0.5 italic" style={{ color: "#7d8d88" }}>{tx.notes}</p>}
                      <div className="flex items-center gap-1 mt-1">
                        <Clock className="w-3 h-3" style={{ color: "#7d8d88" }} />
                        <span className="text-[10px]" style={{ color: "#7d8d88", fontFamily: "IBM Plex Mono, monospace" }}>
                          {new Date(tx.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono truncate max-w-[80px]" style={{ color: "#7d8d88" }} title={tx.transfer_hash}>
                      {tx.transfer_hash.substring(0, 8)}...
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
