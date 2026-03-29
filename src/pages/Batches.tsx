import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { generateBatchCode } from "@/lib/hash";
import { FileText, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Batches() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [batches, setBatches] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", manufacture_date: "", expiry_date: "" });

  const fetchBatches = async () => {
    const { data } = await supabase.from("batches").select("*").eq("manufacturer_id", user!.id).order("created_at", { ascending: false });
    if (data) setBatches(data);
  };

  useEffect(() => {
    document.title = "Batches — AuthentiChain";
    setLoading(true);
    fetchBatches().finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const batchCode = generateBatchCode();
    const { error } = await supabase.from("batches").insert({
      batch_code: batchCode, name: form.name, manufacturer_id: user!.id,
      manufacture_date: form.manufacture_date || null, expiry_date: form.expiry_date || null,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Batch created", description: `Code: ${batchCode}` });
    setDialogOpen(false);
    setForm({ name: "", manufacture_date: "", expiry_date: "" });
    fetchBatches();
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
              <Button variant="hero"><Plus className="w-4 h-4 mr-1" /> Create Batch</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create New Batch</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 mt-4">
                <div><Label>Batch Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Manufacture Date</Label><Input type="date" value={form.manufacture_date} onChange={(e) => setForm({ ...form, manufacture_date: e.target.value })} /></div>
                  <div><Label>Expiry Date</Label><Input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></div>
                </div>
                <Button type="submit" variant="hero" className="w-full">Create Batch</Button>
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
                      <tr key={b.id} className="hover:bg-muted/30 transition-colors">
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
      </div>
    </DashboardLayout>
  );
}
