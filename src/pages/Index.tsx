import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Shield, Package, Truck, QrCode, BarChart3, Lock, ArrowRight, CheckCircle2, FileText } from "lucide-react";
import { motion } from "framer-motion";

const features = [
  { icon: Package, title: "Product Registration", desc: "Register products with unique IDs, batch management, and tamper-resistant hashing." },
  { icon: Truck, title: "Supply Chain Tracking", desc: "Event-based tracking with timestamped logs, locations, and chain-linked hashes." },
  { icon: QrCode, title: "QR Verification", desc: "Instant product verification via QR scan showing full authenticity report." },
  { icon: Shield, title: "Fraud Detection", desc: "Automated detection of duplicate scans, location mismatches, and invalid sequences." },
  { icon: BarChart3, title: "Analytics Dashboard", desc: "Real-time analytics, audit logs, and system monitoring for administrators." },
  { icon: Lock, title: "Data Integrity", desc: "SHA-256 hashed events, append-only logs, and role-based access control." },
];

export default function Index() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
              <Shield className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold">AuthentiChain</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/verify">
              <Button variant="ghost" size="sm">Verify Product</Button>
            </Link>
            <Link to="/system-design">
              <Button variant="ghost" size="sm"><FileText className="w-3 h-3 mr-1" />System Design</Button>
            </Link>
            <Link to="/auth">
              <Button variant="hero" size="sm">Get Started <ArrowRight className="w-3 h-3 ml-1" /></Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-20 lg:py-32">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent border border-border text-xs font-medium text-accent-foreground mb-6">
              <Shield className="w-3 h-3" /> Trusted Supply Chain Verification
            </div>
            <h1 className="text-4xl lg:text-6xl font-extrabold leading-tight max-w-3xl mx-auto">
              Stop Counterfeits.<br />
              <span className="text-gradient">Verify Authenticity.</span>
            </h1>
            <p className="text-lg text-muted-foreground mt-6 max-w-xl mx-auto">
              End-to-end product authentication with tamper-resistant tracking, real-time fraud detection, and instant QR verification.
            </p>
            <div className="flex items-center justify-center gap-3 mt-8">
              <Link to="/auth">
                <Button variant="hero" size="lg">Start Free <ArrowRight className="w-4 h-4 ml-1" /></Button>
              </Link>
              <Link to="/verify">
                <Button variant="outline" size="lg">Verify a Product</Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-muted/30">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold">Complete Authentication Platform</h2>
            <p className="text-muted-foreground mt-2">Everything you need to protect your products and supply chain</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                viewport={{ once: true }}
                className="bg-card rounded-xl border border-border p-6 shadow-card hover:shadow-card-hover transition-shadow"
              >
                <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center mb-4">
                  <f.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { step: "01", title: "Register", desc: "Manufacturer registers product with unique ID and generates QR code" },
              { step: "02", title: "Track", desc: "Each supply chain participant scans and records product movement" },
              { step: "03", title: "Detect", desc: "System automatically flags suspicious activities and anomalies" },
              { step: "04", title: "Verify", desc: "Customer scans QR code to instantly verify product authenticity" },
            ].map((s, i) => (
              <motion.div
                key={s.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                viewport={{ once: true }}
                className="text-center"
              >
                <div className="text-4xl font-extrabold text-gradient mb-3">{s.step}</div>
                <h3 className="font-semibold mb-1">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4">
          <div className="bg-gradient-primary rounded-2xl p-12 text-center">
            <h2 className="text-3xl font-bold text-primary-foreground mb-4">Ready to Protect Your Products?</h2>
            <p className="text-primary-foreground/80 mb-8 max-w-md mx-auto">Join manufacturers worldwide using AuthentiChain to combat counterfeiting.</p>
            <Link to="/auth">
              <Button size="lg" variant="secondary" className="font-semibold">
                Get Started Now <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">AuthentiChain</span>
          </div>
          <p className="text-xs text-muted-foreground">© 2026 AuthentiChain. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
