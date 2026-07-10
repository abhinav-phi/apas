import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { FlowButton } from "@/components/ui/flow-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { generateBatchCode } from "@/lib/hash";
import { FileText, Plus, Package, CheckCircle2, AlertTriangle, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Tables } from "@/integrations/supabase/types";

export default function Batches() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [batches, setBatches] = useState<Tables<"batches">[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", manufacture_date: "", expiry_date: "" });
  
  const [selectedBatch, setSelectedBatch] = useState<Tables<"batches"> | null>(null);
  const [batchProducts, setBatchProducts] = useState<Tables<"products">[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const fetchBatches = async () => {
    const { data } = await supabase.from("batches").select("*").eq("manufacturer_id", user!.id).order("created_at", { ascending: false });
    if (data) setBatches(data);
  };

  useEffect(() => {
    document.title = "Batches — AuthentiChain";
    setLoading(true);
    fetchBatches().finally(() => setLoading(false));
  }, []);

  const handleRowClick = async (batch: Tables<"batches">) => {
    setSelectedBatch(batch);
    setBatchProducts([]);
    setLoadingProducts(true);
    const { data } = await supabase.from("products").select("*").eq("batch_id", batch.id).order("created_at", { ascending: false });
    if (data) setBatchProducts(data);
    setLoadingProducts(false);
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const batchCode = generateBatchCode();
    const { error } = await supabase.from("batches").insert({
      batch_code: batchCode, name: form.name, manufacturer_id: user!.id,
      manufacture_date: form.manufacture_date || null, expiry_date: form.expiry_date || null,
    });
    if (error) { 
      toast({ title: "Error", description: error.message, variant: "destructive" }); 
      setIsSubmitting(false);
      return; 
    }
    toast({ title: "Batch created", description: `Code: ${batchCode}` });
    setDialogOpen(false);
    setForm({ name: "", manufacture_date: "", expiry_date: "" });
    fetchBatches();
    setIsSubmitting(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold">Batches</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage product batches and lots</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <div className="inline-block">
                  <FlowButton size="sm" text={<span className="flex items-center gap-1"><Plus className="w-4 h-4" /> Create Batch</span>} />
                </div>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create New Batch</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 mt-4">
                <div><Label>Batch Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Manufacture Date</Label><Input type="date" value={form.manufacture_date} onChange={(e) => setForm({ ...form, manufacture_date: e.target.value })} /></div>
                  <div><Label>Expiry Date</Label><Input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></div>
                </div>
                  <FlowButton 
                    type="submit" 
                    size="full" 
                    disabled={isSubmitting} 
                    text={isSubmitting ? "Creating..." : "Create Batch"} 
                  />
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Batch</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Code</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Products</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3"><Skeleton className="h-8 w-32" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-12" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                    </tr>
                  ))
                ) : (
                  <>
                    {batches.map((b) => (
                      <tr 
                        key={b.id} 
                        className="hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => handleRowClick(b)}
                      >
                        <td className="px-4 py-3 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center"><FileText className="w-4 h-4 text-primary" /></div>
                          <span className="text-sm font-medium">{b.name}</span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{b.batch_code}</td>
                        <td className="px-4 py-3 text-sm">{b.product_count}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(b.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                    {batches.length === 0 && (
                      <tr><td colSpan={4} className="text-center py-8 text-muted-foreground text-sm">No batches yet</td></tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <Dialog open={!!selectedBatch} onOpenChange={(open) => !open && setSelectedBatch(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" /> 
                Batch Details: {selectedBatch?.name}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto pr-2 mt-4 space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-muted/30 p-4 rounded-xl border border-border">
                  <p className="text-xs text-muted-foreground mb-1">Batch Code</p>
                  <p className="font-mono text-sm">{selectedBatch?.batch_code}</p>
                </div>
                <div className="bg-muted/30 p-4 rounded-xl border border-border">
                  <p className="text-xs text-muted-foreground mb-1">Products Count</p>
                  <p className="font-semibold text-sm">{selectedBatch?.product_count}</p>
                </div>
                <div className="bg-muted/30 p-4 rounded-xl border border-border">
                  <p className="text-xs text-muted-foreground mb-1">Created</p>
                  <p className="text-sm">{selectedBatch ? new Date(selectedBatch.created_at).toLocaleDateString() : ''}</p>
                </div>
              </div>

              {loadingProducts ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-foreground flex items-center justify-between">
                    <span>Products in Batch</span>
                    <span className="text-xs text-muted-foreground font-normal bg-muted px-2 py-1 rounded-md">
                      {batchProducts.length} items
                    </span>
                  </h3>
                  {batchProducts.length === 0 ? (
                    <div className="text-center py-8 bg-muted/20 rounded-xl border border-border border-dashed">
                      <p className="text-sm text-muted-foreground">No products registered in this batch yet.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {batchProducts.map(p => (
                        <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center">
                              <Package className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{p.name}</p>
                              <p className="text-xs text-muted-foreground font-mono">{p.product_code}</p>
                            </div>
                          </div>
                          <StatusBadge status={p.is_flagged ? "suspicious" : p.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
