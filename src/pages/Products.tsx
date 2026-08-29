import { useCallback, useEffect, useRef, useState } from "react";
import React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { FlowButton } from "@/components/ui/flow-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateProductCode, generateProductHash, generateQRData } from "@/lib/hash";
import { parseCsv } from "@/lib/csv";
import {
  Package, Plus, Search, Link2, ExternalLink, Upload, Loader2,
  Layers, AlertTriangle, RefreshCw, Fuel,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/use-debounce";
import { useNavigate } from "react-router-dom";
import { useBlockchain, type GasEstimate } from "@/hooks/use-blockchain";
import {
  SEPOLIA_FAUCET_URL,
  etherscanTxUrl,
  publicClient,
  toWalletError,
} from "@/lib/blockchain";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

type Product = Tables<"products">;

const CATEGORIES = ["general", "pharmaceutical", "electronics", "luxury", "food", "automotive"] as const;
const PAGE_SIZE = 25;

// Escape PostgREST LIKE wildcards so a user-typed % or \ is treated literally
// rather than as a wildcard inside the ilike filter.
function escapeLike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%");
}

export default function Products() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { configured, estimateAnchorCost, anchorProduct, anchorProductsBatch, connect, address } = useBlockchain();
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Tables<"batches">[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);
  const [totalCount, setTotalCount] = useState(0);
  const [unanchoredCount, setUnanchoredCount] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [importingCsv, setImportingCsv] = useState(false);
  const csvInputRef = React.useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: "", brand: "", category: "general", description: "", origin_country: "",
    manufacture_date: "", expiry_date: "", batch_id: "",
  });

  // Anchor dialog state (ImplementationPlan 4.1 — gas estimate shown before submit)
  const [anchorTarget, setAnchorTarget] = useState<Product | null>(null);
  const [anchorEstimate, setAnchorEstimate] = useState<GasEstimate | null>(null);
  const [anchorBusy, setAnchorBusy] = useState(false);
  const [batchAnchoring, setBatchAnchoring] = useState(false);
  // Recall confirmation target — irreversible action must be explicitly confirmed
  const [recallTarget, setRecallTarget] = useState<{ id: string; code: string } | null>(null);

  // Latest filter/page values held in refs so fetchProducts can stay a stable
  // callback (deps: user/role/toast) while still reading fresh inputs.
  const pageRef = useRef(page); pageRef.current = page;
  const searchRef = useRef(debouncedSearch); searchRef.current = debouncedSearch;
  const categoryRef = useRef(category); categoryRef.current = category;

  const fetchProducts = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const term = (searchRef.current || "").trim();
    const cat = categoryRef.current;
    const from = (pageRef.current - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    // R20: ALL filtering + pagination happens server-side. No unbounded
    // select("*") — we request exactly one page and an exact total count.
    let q = supabase
      .from("products")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });
    if (role === "manufacturer") q = q.eq("manufacturer_id", user.id);
    if (cat && cat !== "all") q = q.eq("category", cat);
    if (term) {
      const t = escapeLike(term);
      q = q.or(`name.ilike.%${t}%,product_code.ilike.%${t}%,brand.ilike.%${t}%`);
    }
    q = q.range(from, to);

    const { data, error, count } = await q;
    if (error) {
      toast({ title: "Could not load products", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    setProducts(data || []);
    setTotalCount(count || 0);
    setLoading(false);

    // Unanchored count for the batch-anchor CTA (manufacturer only)
    if (role === "manufacturer") {
      const { count: unanchored } = await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("manufacturer_id", user.id)
        .eq("status", "active")
        .is("blockchain_tx", null);
      setUnanchoredCount(unanchored || 0);
    }
  }, [user?.id, role, toast]);

  const fetchBatches = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase.from("batches").select("*").eq("manufacturer_id", user.id);
    if (error) {
      toast({ title: "Could not load batches", description: error.message, variant: "destructive" });
      return;
    }
    if (data) setBatches(data);
  }, [user?.id, toast]);

  useEffect(() => {
    document.title = "Products — AuthentiChain";
  }, []);

  // Server-side fetch: pagination, search and category filtering all happen in
  // the query (Rule R20). Refetch whenever the page, debounced search, or
  // category changes. fetchProducts reads inputs from refs so it stays stable.
  useEffect(() => {
    fetchProducts();
  }, [page, debouncedSearch, category, fetchProducts]);

  useEffect(() => {
    if (role === "manufacturer") fetchBatches();
  }, [fetchBatches, role]);

  // Reset to the first page when the search or category filter changes
  useEffect(() => {
    setPage(1);
  }, [search, category]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Genesis events go through the server-side RPC (Rules R16/R17 — client
  // hashes are forgeable; the RPC computes the hash and validates the actor)
  const recordEvent = async (
    productId: string,
    eventType: string,
    location?: string | null
  ): Promise<{ success: boolean; message?: string }> => {
    const { data, error } = await supabase.rpc("record_supply_chain_event", {
      p_product_id: productId,
      p_event_type: eventType,
      p_location: location ?? null,
    });
    if (error) return { success: false, message: error.message };
    const result = data as { success: boolean; message?: string };
    return { success: result.success === true, message: result.message };
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const productCode = generateProductCode();
    const ts = new Date().toISOString();
    const hash = generateProductHash({ productCode, name: form.name, brand: form.brand, manufacturerId: user!.id, timestamp: ts });
    const qrData = generateQRData(productCode, hash);

    const { data: inserted, error } = await supabase
      .from("products")
      .insert({
        product_code: productCode, name: form.name, brand: form.brand, category: form.category,
        description: form.description || null, origin_country: form.origin_country || null,
        manufacture_date: form.manufacture_date || null, expiry_date: form.expiry_date || null,
        batch_id: form.batch_id || null, manufacturer_id: user!.id, verification_hash: hash, qr_data: qrData,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      toast({ title: "Error", description: error?.message ?? "Could not register product", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }

    const event = await recordEvent(inserted.id, "manufactured", form.origin_country || null);
    if (!event.success) {
      toast({
        title: "Product registered (event rejected)",
        description: event.message ?? "The manufactured event could not be recorded.",
        variant: "destructive",
      });
    } else {
      toast({ title: "Product registered", description: `Code: ${productCode}` });
    }
    setDialogOpen(false);
    setForm({ name: "", brand: "", category: "general", description: "", origin_country: "", manufacture_date: "", expiry_date: "", batch_id: "" });
    fetchProducts();
    setIsSubmitting(false);
  };

  // ── On-chain anchoring (real Sepolia TX via viem) ────────────────────
  const openAnchorDialog = async (product: Product) => {
    setAnchorTarget(product);
    setAnchorEstimate(null);
    try {
      const est = await estimateAnchorCost({
        productId: product.id,
        verificationHash: product.verification_hash,
        batchCode: product.batch_id ?? "none",
      });
      setAnchorEstimate(est);
    } catch (err: unknown) {
      const werr = toWalletError(err);
      setAnchorTarget(null);
      if (werr.code === "insufficient_funds") {
        toast({ title: "Insufficient funds for gas", description: `Top up at ${SEPOLIA_FAUCET_URL}`, variant: "destructive" });
      } else {
        toast({ title: "Could not estimate gas", description: werr.message, variant: "destructive" });
      }
    }
  };

  const handleConfirmAnchor = async () => {
    if (!anchorTarget) return;
    setAnchorBusy(true);
    try {
      const result = await anchorProduct({
        id: anchorTarget.id,
        verificationHash: anchorTarget.verification_hash,
        batchCode: anchorTarget.batch_id ?? "none",
      });
      if (result.status === "confirmed") {
        toast({
          title: "✓ Anchored on Sepolia",
          description: `TX ${result.txHash.slice(0, 18)}… confirmed — Etherscan link is now live.`,
        });
      } else {
        toast({
          title: "Transaction failed on-chain",
          description: "The transaction was mined but reverted. No anchor was recorded.",
          variant: "destructive",
        });
      }
      setAnchorTarget(null);
      fetchProducts();
    } catch (err: unknown) {
      const werr = toWalletError(err);
      if (werr.code === "cancelled") {
        toast({ title: "Transaction cancelled", description: werr.message });
      } else if (werr.code === "insufficient_funds") {
        toast({
          title: "Insufficient Sepolia ETH",
          description: `Get testnet ETH at ${SEPOLIA_FAUCET_URL} and retry.`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Anchoring failed", description: werr.message, variant: "destructive" });
      }
    } finally {
      setAnchorBusy(false);
    }
  };

  // Re-check a TX that is still marked pending. Prefers the server-side
  // Edge Function (authoritative receipt verification, audit F4 residual);
  // falls back to a direct public-RPC read when the function is not deployed.
  const handleRecheckPending = async (product: Product) => {
    if (!product.blockchain_tx) return;
    const txHash = product.blockchain_tx;
    const applyStatus = async (status: "confirmed" | "failed") => {
      const { error } = await supabase.rpc("record_blockchain_anchor", {
        p_product_id: product.id, p_tx_hash: txHash, p_status: status,
      });
      if (error) throw new Error(error.message);
      toast({
        title: status === "confirmed" ? "✓ Anchor confirmed" : "Anchor failed on-chain",
        description: status === "confirmed" ? etherscanTxUrl(txHash) : "The transaction reverted.",
        variant: status === "confirmed" ? undefined : "destructive",
      });
      fetchProducts();
    };
    try {
      const { data, error } = await supabase.functions.invoke("verify-anchor-receipt", {
        body: { productId: product.id, txHash },
      });
      if (error) throw new Error(error.message);
      const result = data as { ok: boolean; mined: boolean; status?: "confirmed" | "failed"; reason?: string };
      if (!result.ok) throw new Error(result.reason ?? "Verification failed");
      if (!result.mined) {
        toast({ title: "Still pending", description: "The transaction has not been mined yet — check again shortly." });
        return;
      }
      await applyStatus(result.status ?? "failed");
    } catch {
      // Edge Function unavailable (not deployed) — public-RPC fallback
      try {
        const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
        await applyStatus(receipt.status === "success" ? "confirmed" : "failed");
      } catch {
        toast({ title: "Still pending", description: "The transaction has not been mined yet — check again shortly." });
      }
    }
  };

  const handleBatchAnchor = async () => {
    const eligible = products.filter(
      (p) => p.status === "active" && !p.blockchain_tx && p.manufacturer_id === user!.id
    );
    if (eligible.length === 0) return;
    setBatchAnchoring(true);
    try {
      if (!address) await connect();
      const result = await anchorProductsBatch(
        eligible.map((p) => ({ id: p.id, verificationHash: p.verification_hash })),
        "BULK-IMPORT"
      );
      toast({
        title: result.status === "confirmed" ? `✓ ${eligible.length} products anchored` : "Batch transaction reverted",
        description: `${eligible.length} products in one TX: ${result.txHash.slice(0, 18)}…`,
        variant: result.status === "confirmed" ? undefined : "destructive",
      });
      fetchProducts();
    } catch (err: unknown) {
      const werr = toWalletError(err);
      toast({
        title: werr.code === "cancelled" ? "Transaction cancelled" : "Batch anchor failed",
        description: werr.code === "insufficient_funds" ? `Get testnet ETH at ${SEPOLIA_FAUCET_URL}.` : werr.message,
        variant: "destructive",
      });
    } finally {
      setBatchAnchoring(false);
    }
  };

  const handleRecall = async (productId: string, productCode: string) => {
    // Recall via server RPC — flips status, appends the hash-chained event,
    // and records the manual_flag alert in the same trusted transaction.
    const event = await recordEvent(productId, "recalled");
    if (!event.success) {
      toast({ title: "Recall rejected", description: event.message ?? "The recalled event could not be recorded.", variant: "destructive" });
      setRecallTarget(null);
      return;
    }
    toast({ title: "Product recalled", description: "Supply chain event and fraud alert recorded." });
    setRecallTarget(null);
    fetchProducts();
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Audit MEDIUM #8: robust CSV import.
  // - RFC-4180 parsing (quoted commas/quotes/newlines) instead of split(',')
  // - 500-row cap — giant single payloads get rejected by PostgREST
  // - Per-row validation with row numbers; valid rows still import
  // - Optional manufacture_date / expiry_date columns, YYYY-MM-DD enforced
  // - Chunked inserts (100 rows per request)
  const CSV_MAX_ROWS = 500;
  const CSV_CHUNK_SIZE = 100;

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportingCsv(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
        if (rows.length < 2) throw new Error("CSV must contain a header and at least one row");

        const headers = rows[0].map((h) => h.trim().toLowerCase());
        const requiredHeaders = ["name", "brand", "category"];
        if (!requiredHeaders.every((h) => headers.includes(h))) {
          throw new Error("CSV must contain columns: name, brand, category");
        }
        if (rows.length - 1 > CSV_MAX_ROWS) {
          throw new Error(`Too many rows (${rows.length - 1}). Import at most ${CSV_MAX_ROWS} rows per file — split the CSV and import in batches.`);
        }

        const col = (name: string) => headers.indexOf(name);
        const nameIdx = col("name");
        const brandIdx = col("brand");
        const categoryIdx = col("category");
        const descIdx = col("description");
        const originIdx = col("origin_country");
        const mfgIdx = col("manufacture_date");
        const expIdx = col("expiry_date");

        const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
        const cell = (row: string[], i: number) => (i > -1 ? (row[i] ?? "").trim() : "");

        const productsToInsert: TablesInsert<"products">[] = [];
        const rowErrors: string[] = [];
        const ts = new Date().toISOString();

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          // +2 → 1-based row number counting the header line
          const fail = (msg: string) => rowErrors.push(`Row ${i + 2}: ${msg}`);

          const name = cell(row, nameIdx);
          const brand = cell(row, brandIdx);
          if (!name || !brand) {
            fail("name and brand are required");
            continue;
          }

          const category = cell(row, categoryIdx).toLowerCase() || "general";
          if (!(CATEGORIES as readonly string[]).includes(category)) {
            fail(`unknown category "${category}" — allowed: ${CATEGORIES.join(", ")}`);
            continue;
          }

          let manufactureDate: string | null = null;
          let expiryDate: string | null = null;
          if (mfgIdx > -1 && cell(row, mfgIdx)) {
            const v = cell(row, mfgIdx);
            if (!DATE_RE.test(v)) {
              fail(`manufacture_date must be YYYY-MM-DD (got "${v}")`);
              continue;
            }
            manufactureDate = v;
          }
          if (expIdx > -1 && cell(row, expIdx)) {
            const v = cell(row, expIdx);
            if (!DATE_RE.test(v)) {
              fail(`expiry_date must be YYYY-MM-DD (got "${v}")`);
              continue;
            }
            expiryDate = v;
          }

          const productCode = generateProductCode();
          const hash = generateProductHash({
            productCode,
            name,
            brand,
            manufacturerId: user!.id,
            timestamp: ts
          });
          const qrData = generateQRData(productCode, hash);

          productsToInsert.push({
            product_code: productCode,
            name,
            brand,
            category,
            description: cell(row, descIdx) || null,
            origin_country: cell(row, originIdx) || null,
            manufacture_date: manufactureDate,
            expiry_date: expiryDate,
            manufacturer_id: user!.id,
            verification_hash: hash,
            qr_data: qrData,
          });
        }

        if (productsToInsert.length === 0) {
          throw new Error(
            `No valid rows found. ${rowErrors.slice(0, 3).join(" · ")}${rowErrors.length > 3 ? ` …and ${rowErrors.length - 3} more` : ""}`
          );
        }

        // Chunked inserts — one giant payload gets rejected by PostgREST
        const insertedProducts: { id: string }[] = [];
        for (let start = 0; start < productsToInsert.length; start += CSV_CHUNK_SIZE) {
          const chunk = productsToInsert.slice(start, start + CSV_CHUNK_SIZE);
          const { data, error } = await supabase.from("products").insert(chunk).select("id");
          if (error) throw error;
          if (data) insertedProducts.push(...(data as { id: string }[]));
        }

        // Genesis events via server RPC (hash chain computed server-side)
        let eventFailures = 0;
        if (insertedProducts.length > 0) {
          const results = await Promise.allSettled(
            insertedProducts.map((p) => recordEvent(p.id, "manufactured"))
          );
          eventFailures = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.success)).length;
        }

        const skipped = rowErrors.length;
        toast({
          title: skipped > 0 ? `Imported ${insertedProducts.length} — ${skipped} row(s) skipped` : "Import Successful",
          description:
            (skipped > 0 ? `${rowErrors.slice(0, 3).join(" · ")}${rowErrors.length > 3 ? " …" : ""}. ` : "") +
            `Use "Batch Anchor" to put them on-chain in one transaction.`,
          variant: skipped > 0 || eventFailures > 0 ? "destructive" : undefined,
        });
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

  const anchorCell = (p: Product) => {
    if (p.blockchain_tx) {
      if (p.blockchain_tx_status === "confirmed") {
        return (
          <a
            href={etherscanTxUrl(p.blockchain_tx)}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-semibold hover:bg-emerald-500/20 transition-colors"
            title={`TX ${p.blockchain_tx} — view on Etherscan`}
          >
            On-chain <ExternalLink className="w-3 h-3" />
          </a>
        );
      }
      if (p.blockchain_tx_status === "failed") {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/10 text-red-400 text-[10px] font-semibold" title={`TX ${p.blockchain_tx} reverted`}>
            <AlertTriangle className="w-3 h-3" /> Failed
          </span>
        );
      }
      // pending — never show a live Etherscan badge until confirmed (Rules R5 / 4.1)
      return (
        <button
          onClick={(e) => { e.stopPropagation(); handleRecheckPending(p); }}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/10 text-amber-500 text-[10px] font-semibold hover:bg-amber-500/20 transition-colors"
          title={`TX ${p.blockchain_tx} — click to re-check confirmation`}
        >
          <RefreshCw className="w-3 h-3 animate-spin [animation-duration:3s]" /> Pending
        </button>
      );
    }
    if (p.status === "active" && role === "manufacturer" && p.manufacturer_id === user?.id) {
      return configured ? (
        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); openAnchorDialog(p); }}>
          <Link2 className="w-3 h-3 mr-1" /> Anchor
        </Button>
      ) : (
        <span className="text-xs text-muted-foreground/40" title="Set VITE_CONTRACT_ADDRESS to enable on-chain anchoring">—</span>
      );
    }
    return <span className="text-xs text-muted-foreground/40">—</span>;
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
              {configured && unanchoredCount > 1 && (
                <Button variant="outline" size="sm" onClick={handleBatchAnchor} disabled={batchAnchoring} className="gap-1.5" title="Anchor all unanchored products in a single Sepolia transaction (registerProducts multicall)">
                  {batchAnchoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
                  Batch Anchor ({unanchoredCount})
                </Button>
              )}
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

        {/* Anchor confirmation dialog — cost shown before signing (4.1 REQUIRED) */}
        <Dialog open={anchorTarget !== null} onOpenChange={(open) => { if (!open && !anchorBusy) setAnchorTarget(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Anchor on Sepolia</DialogTitle>
            </DialogHeader>
            {anchorTarget && (
              <div className="space-y-4 mt-2">
                <div className="text-sm">
                  <p className="font-medium">{anchorTarget.name}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{anchorTarget.product_code}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Fuel className="w-3.5 h-3.5" />
                    {anchorEstimate ? (
                      <span>
                        Est. cost: <span className="text-foreground font-mono">{anchorEstimate.estEth} ETH</span>
                        <span className="text-muted-foreground"> (gas {Number(anchorEstimate.gasUnits).toLocaleString()} × EIP-1559 fees)</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Estimating gas…</span>
                    )}
                  </div>
                  <p className="text-muted-foreground">
                    Your wallet will ask you to sign a real <span className="font-mono">registerProduct</span> transaction
                    on Sepolia (chain 11155111). The Etherscan link appears once the transaction is confirmed.
                  </p>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" onClick={() => setAnchorTarget(null)} disabled={anchorBusy}>Cancel</Button>
                  <Button onClick={handleConfirmAnchor} disabled={!anchorEstimate || anchorBusy} className="gap-1.5">
                    {anchorBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                    {anchorBusy ? "Waiting for confirmation…" : "Confirm & Sign"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative max-w-sm flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                    {products.map((p) => (
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
                        <td className="px-4 py-3">{anchorCell(p)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</td>
                        {role === "manufacturer" && (
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              {p.status === "active" && (
                                <Button variant="destructive" size="sm" onClick={(e) => { e.stopPropagation(); setRecallTarget({ id: p.id, code: p.product_code }); }}>Recall</Button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                    {products.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-8 text-muted-foreground text-sm">No products found</td></tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <PaginationBar
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          isLoading={loading}
        />
      </div>

      <AlertDialog open={!!recallTarget} onOpenChange={(o) => { if (!o) setRecallTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recall product?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently marks <span className="font-mono">{recallTarget?.code}</span> as recalled and
              files a fraud alert. This action is <strong>irreversible</strong> — the product can no longer be
              verified as genuine. Are you sure you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (recallTarget) handleRecall(recallTarget.id, recallTarget.code); }}
            >
              Yes, recall product
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
