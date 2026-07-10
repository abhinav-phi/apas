import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { FlowButton } from "@/components/ui/flow-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateProductCode, generateProductHash, generateQRData, generateEventHash } from "@/lib/hash";
import { Package, Plus, Search, Link2, ExternalLink, Eye, Upload, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import type { Tables } from "@/integrations/supabase/types";

export default function Products() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Tables<'products'>[]>([]);
  const [batches, setBatches] = useState<Tables<"batches">[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [importingCsv, setImportingCsv] = useState(false);
  const csvInputRef = React.useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: "", brand: "", category: "general", description: "", origin_country: "",
    manufacture_date: "", expiry_date: "", batch_id: "",
  });

  const fetchProducts = async () => {
    let q = supabase.from("products").select("*").order("created_at", { ascending: false });
    if (role === "manufacturer") q = q.eq("manufacturer_id", user!.id);
    const { data } = await q;
    if (data) setProducts(data);
  };

  const fetchBatches = async () => {
    const { data } = await supabase.from("batches").select("*").eq("manufacturer_id", user!.id);
    if (data) setBatches(data);
  };

  useEffect(() => {
    document.title = "Products — AuthentiChain";
    const init = async () => {
      setLoading(true);
      await Promise.all([
        fetchProducts(),
        role === "manufacturer" ? fetchBatches() : Promise.resolve()
      ]);
      setLoading(false);
    };
    init();
  }, []);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const productCode = generateProductCode();
    const ts = new Date().toISOString();
    const hash = generateProductHash({ productCode, name: form.name, brand: form.brand, manufacturerId: user!.id, timestamp: ts });
    const qrData = generateQRData(productCode, hash);

    const { error } = await supabase.from("products").insert({
      product_code: productCode, name: form.name, brand: form.brand, category: form.category,
      description: form.description || null, origin_country: form.origin_country || null,
      manufacture_date: form.manufacture_date || null, expiry_date: form.expiry_date || null,
      batch_id: form.batch_id || null, manufacturer_id: user!.id, verification_hash: hash, qr_data: qrData,
    });

    if (error) { 
      toast({ title: "Error", description: error.message, variant: "destructive" }); 
      setIsSubmitting(false);
      return; 
    }

    const eventHash = generateEventHash({ productId: productCode, eventType: "manufactured", actorId: user!.id, timestamp: ts });
    const { data: newProd } = await supabase.from("products").select("id").eq("product_code", productCode).single();
    if (newProd) {
      await supabase.from("supply_chain_events").insert({
        product_id: newProd.id, actor_id: user!.id, event_type: "manufactured",
        location: form.origin_country || null, event_hash: eventHash,
      });
    }

    toast({ title: "Product registered", description: `Code: ${productCode}` });
    setDialogOpen(false);
    setForm({ name: "", brand: "", category: "general", description: "", origin_country: "", manufacture_date: "", expiry_date: "", batch_id: "" });
    fetchProducts();
    setIsSubmitting(false);
  };

  const handleAnchorBlockchain = async (productId: string, productCode: string) => {
    const { data, error } = await supabase.rpc("anchor_to_blockchain", { p_product_id: productId });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    const result = data as { success: boolean; tx_hash: string; message: string };
    // NOTE: This is a simulated hash anchor (SHA-256 fingerprint), not a real Ethereum transaction.
    toast({
      title: "🔗 Product Hash Anchored",
      description: `SHA-256 anchor: ${result.tx_hash?.substring(0, 20)}... (simulated — real blockchain integration planned)`,
    });
    fetchProducts();
  };

  const handleRecall = async (productId: string, productCode: string) => {
    await supabase.from("products").update({ status: "recalled" }).eq("id", productId);

    // Get last event hash
    const { data: lastEvent } = await supabase.from("supply_chain_events").select("event_hash").eq("product_id", productId).order("created_at", { ascending: false }).limit(1).maybeSingle();

    const ts = new Date().toISOString();
    const eventHash = generateEventHash({
      productId, eventType: "recalled", actorId: user!.id, timestamp: ts,
      previousHash: lastEvent?.event_hash,
    });

    await supabase.from("supply_chain_events").insert({
      product_id: productId, actor_id: user!.id, event_type: "recalled",
      previous_event_hash: lastEvent?.event_hash || null, event_hash: eventHash,
    });

    await supabase.from("fraud_alerts").insert({
      product_id: productId, alert_type: "manual_flag", severity: "high",
      description: `Product ${productCode} recalled by manufacturer`,
    });

    toast({ title: "Product recalled", description: "Supply chain event and alert recorded." });
    fetchProducts();
  };

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.product_code.toLowerCase().includes(search.toLowerCase()) ||
    p.brand.toLowerCase().includes(search.toLowerCase())
  );

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportingCsv(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length < 2) throw new Error("CSV must contain a header and at least one row");

        const headers = lines[0].toLowerCase().split(',');
        const requiredHeaders = ['name', 'brand', 'category'];
        if (!requiredHeaders.every(h => headers.includes(h))) {
          throw new Error("CSV must contain columns: name, brand, category");
        }

        const nameIdx = headers.indexOf('name');
        const brandIdx = headers.indexOf('brand');
        const categoryIdx = headers.indexOf('category');
        const descIdx = headers.indexOf('description');
        const originIdx = headers.indexOf('origin_country');

        const productsToInsert = [];
        const eventsToInsert = [];
        const ts = new Date().toISOString();

        for (let i = 1; i < lines.length; i++) {
          const row = lines[i].split(',').map(c => c.trim());
          if (row.length < 3) continue;

          const productCode = generateProductCode();
          const hash = generateProductHash({
            productCode,
            name: row[nameIdx],
            brand: row[brandIdx],
            manufacturerId: user!.id,
            timestamp: ts
          });
          const qrData = generateQRData(productCode, hash);

          productsToInsert.push({
            product_code: productCode,
            name: row[nameIdx],
            brand: row[brandIdx],
            category: row[categoryIdx] || 'general',
            description: descIdx > -1 ? row[descIdx] : null,
            origin_country: originIdx > -1 ? row[originIdx] : null,
            manufacturer_id: user!.id,
            verification_hash: hash,
            qr_data: qrData,
          });
        }

        if (productsToInsert.length === 0) throw new Error("No valid rows found");

        const { data: insertedProducts, error } = await supabase
          .from("products")
          .insert(productsToInsert)
          .select("id, product_code");

        if (error) throw error;

        // Generate genesis events for all
        if (insertedProducts && insertedProducts.length > 0) {
          insertedProducts.forEach(p => {
            const eventHash = generateEventHash({ productId: p.product_code, eventType: "manufactured", actorId: user!.id, timestamp: ts });
            eventsToInsert.push({
              product_id: p.id, actor_id: user!.id, event_type: "manufactured",
              event_hash: eventHash,
            });
          });

          await supabase.from("supply_chain_events").insert(eventsToInsert);
        }

        toast({ title: "Import Successful", description: `Imported ${productsToInsert.length} products.` });
        fetchProducts();
      } catch (err: unknown) {
        toast({ title: "Import Failed", description: (err as Error).message, variant: "destructive" });
      } finally {
        setImportingCsv(false);
        if (csvInputRef.current) csvInputRef.current.value = "";
      }
    };
    reader.onerror = () => {
      toast({ title: "Error", description: "Failed to read file", variant: "destructive" });
      setImportingCsv(false);
    };
    reader.readAsText(file);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold">Products</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage and track registered products</p>
          </div>
          {role === "manufacturer" && (
            <div className="flex items-center gap-2">
              <input type="file" accept=".csv" className="hidden" ref={csvInputRef} onChange={handleCsvImport} />
              <Button variant="outline" size="sm" onClick={() => csvInputRef.current?.click()} disabled={importingCsv} className="gap-1.5 border-dashed">
                {importingCsv ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                CSV Import
              </Button>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <div className="inline-block">
                    <FlowButton 
                      text={<span className="flex items-center gap-1"><Plus className="w-4 h-4" /> Register Product</span>} 
                      size="sm" 
                    />
                  </div>
                </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Register New Product</DialogTitle></DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Product Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
                    <div><Label>Brand *</Label><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} required /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Category</Label>
                      <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="general">General</SelectItem>
                          <SelectItem value="pharmaceutical">Pharmaceutical</SelectItem>
                          <SelectItem value="electronics">Electronics</SelectItem>
                          <SelectItem value="luxury">Luxury Goods</SelectItem>
                          <SelectItem value="food">Food & Beverage</SelectItem>
                          <SelectItem value="automotive">Automotive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>Origin Country</Label><Input value={form.origin_country} onChange={(e) => setForm({ ...form, origin_country: e.target.value })} /></div>
                  </div>
                  <div><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Manufacture Date</Label><Input type="date" value={form.manufacture_date} onChange={(e) => setForm({ ...form, manufacture_date: e.target.value })} /></div>
                    <div><Label>Expiry Date</Label><Input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></div>
                  </div>
                  {batches.length > 0 && (
                    <div>
                      <Label>Batch (optional)</Label>
                      <Select value={form.batch_id} onValueChange={(v) => setForm({ ...form, batch_id: v })}>
                        <SelectTrigger><SelectValue placeholder="No batch" /></SelectTrigger>
                        <SelectContent>
                          {batches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name} ({b.batch_code})</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <FlowButton 
                    type="submit" 
                    size="full" 
                    disabled={isSubmitting}
                    text={isSubmitting ? "Registering..." : "Register Product"}
                  />
                </form>
              </DialogContent>
            </Dialog>
            </div>
          )}
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Product</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Code</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Category</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Chain</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Created</th>
                  {role === "manufacturer" && <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3"><Skeleton className="h-8 w-40" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-5 w-16" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                      {role === "manufacturer" && <td className="px-4 py-3"><Skeleton className="h-8 w-16" /></td>}
                    </tr>
                  ))
                ) : (
                  <>
                    {filtered.map((p) => (
                      <tr key={p.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => navigate(`/products/${p.id}`)}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center"><Package className="w-4 h-4 text-primary" /></div>
                            <div>
                              <p className="text-sm font-medium">{p.name}</p>
                              <p className="text-xs text-muted-foreground">{p.brand}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.product_code}</td>
                        <td className="px-4 py-3 text-sm capitalize">{p.category}</td>
                        <td className="px-4 py-3"><StatusBadge status={p.is_flagged ? "suspicious" : p.status} /></td>
                        <td className="px-4 py-3">
                          {p.blockchain_tx ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 text-[10px] font-semibold" title={`Hash: ${p.blockchain_tx}`}>
                              🔗 Anchored
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/40">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</td>
                        {role === "manufacturer" && (
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              {p.status === "active" && !p.blockchain_tx && (
                                <Button variant="outline" size="sm" onClick={() => handleAnchorBlockchain(p.id, p.product_code)}>
                                  <Link2 className="w-3 h-3 mr-1" /> Anchor
                                </Button>
                              )}
                              {p.status === "active" && (
                                <Button variant="destructive" size="sm" onClick={() => handleRecall(p.id, p.product_code)}>Recall</Button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-8 text-muted-foreground text-sm">No products found</td></tr>
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
