import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Shield, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { AppFooter } from "@/components/layout/AppFooter";

const stateTransitions = [
  { current: "manufactured", input: "ship", next: "shipped", desc: "Product leaves manufacturer" },
  { current: "shipped", input: "start_transit", next: "in_transit", desc: "Product in transit" },
  { current: "in_transit", input: "arrive", next: "received", desc: "Product received at location" },
  { current: "received", input: "reship", next: "shipped", desc: "Re-shipped to another location" },
  { current: "received", input: "deliver", next: "delivered", desc: "Final delivery" },
  { current: "delivered", input: "purchase", next: "sold", desc: "Customer purchase" },
  { current: "any", input: "recall", next: "recalled", desc: "Manufacturer recall" },
  { current: "any", input: "expire", next: "expired", desc: "Product expiry" },
];

const rbacMatrix = [
  { perm: "Register Products", manufacturer: true, supplier: false, customer: false, admin: false },
  { perm: "Track Supply Chain", manufacturer: true, supplier: true, customer: false, admin: true },
  { perm: "Verify Products", manufacturer: true, supplier: true, customer: true, admin: true },
  { perm: "Recall Products", manufacturer: true, supplier: false, customer: false, admin: true },
  { perm: "Audit Logs", manufacturer: false, supplier: false, customer: false, admin: true },
];

const fraudRules = [
  { rule: "Rapid Scans", desc: "Flags products scanned more than 50 times — indicates possible cloning or scanning abuse.", severity: "Medium" },
  { rule: "Location Mismatch", desc: "Detects when a product appears at a location inconsistent with its supply chain path.", severity: "High" },
  { rule: "Invalid Sequence", desc: "Flags state transitions that violate the δ-notation table (e.g., manufactured → delivered).", severity: "High" },
  { rule: "Manual Flag", desc: "Allows admin/manufacturer to manually flag a product and raise a fraud alert.", severity: "High" },
];

export default function SystemDesign() {
  useEffect(() => { document.title = "System Design — AuthentiChain"; }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Shield className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-sm">AuthentiChain</span>
          </Link>
          <span className="text-muted-foreground text-sm ml-auto">System Design</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10 space-y-10 flex-1">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-bold mb-2">System Design Documentation</h1>
          <p className="text-muted-foreground">Formal specification of the AuthentiChain supply chain integrity system.</p>
        </motion.div>

        {/* State Transition Table */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold">δ-Notation State Transition Table</h2>
          <p className="text-sm text-muted-foreground">Defines the valid product lifecycle states and transitions. Any transition not listed here triggers a fraud alert.</p>
          <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Current State (q)</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Input Event (σ)</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Next State δ(q, σ)</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stateTransitions.map((t, i) => (
                    <tr key={i} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-sm font-mono">{t.current}</td>
                      <td className="px-4 py-3 text-sm font-mono text-primary">{t.input}</td>
                      <td className="px-4 py-3 text-sm font-mono font-semibold">{t.next}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{t.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* RBAC Table */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold">Role-Based Access Control Matrix</h2>
          <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Permission</th>
                    <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Manufacturer</th>
                    <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Supplier</th>
                    <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Customer</th>
                    <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Admin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rbacMatrix.map((r) => (
                    <tr key={r.perm} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium">{r.perm}</td>
                      {[r.manufacturer, r.supplier, r.customer, r.admin].map((v, i) => (
                        <td key={i} className="px-4 py-3 text-center text-sm">
                          {v ? <span className="text-success font-bold">✓</span> : <span className="text-muted-foreground">✗</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Hash Chain */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold">SHA-256 Hash Chain Integrity</h2>
          <div className="bg-card rounded-xl border border-border p-6 shadow-card space-y-4">
            <p className="text-sm text-muted-foreground">
              Every supply chain event is cryptographically linked to the previous one, forming an immutable, tamper-evident chain. If any record is modified, the hash chain breaks and the system flags it as tampered.
            </p>
            <div className="bg-muted/50 rounded-lg p-4 font-mono text-xs text-foreground overflow-x-auto">
              event_hash = SHA-256( product_id | event_type | actor_id | timestamp | previous_event_hash )
            </div>
            <p className="text-sm text-muted-foreground">
              During verification, the system re-computes each event's hash and compares it against the stored value. A mismatch indicates the record has been tampered with.
            </p>
          </div>
        </section>

        {/* Fraud Detection */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold">Fraud Detection Rules</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {fraudRules.map((r) => (
              <div key={r.rule} className="bg-card rounded-xl border border-border p-5 shadow-card">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-semibold text-sm">{r.rule}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${r.severity === "High" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"}`}>
                    {r.severity}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{r.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <AppFooter />
    </div>
  );
}
