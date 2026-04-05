import { Link } from "react-router-dom";
import { Shield, Package, Truck, QrCode, BarChart3, Lock, ArrowRight, FileText } from "lucide-react";
import { motion } from "framer-motion";
import { AppFooter } from "@/components/layout/AppFooter";
import { CosmicParallaxBg } from "@/components/ui/parallax-cosmic-background";
import { FlowButton } from "@/components/ui/flow-button";

const features = [
  { icon: Package, title: "Product Registration", desc: "Register products with unique IDs, batch management, and tamper-resistant hashing." },
  { icon: Truck, title: "Supply Chain Tracking", desc: "Event-based tracking with timestamped logs, locations, and chain-linked hashes." },
  { icon: QrCode, title: "QR Verification", desc: "Instant product verification via QR scan showing full authenticity report." },
  { icon: Shield, title: "Fraud Detection", desc: "Automated detection of duplicate scans, location mismatches, and invalid sequences." },
  { icon: BarChart3, title: "Analytics Dashboard", desc: "Real-time analytics, audit logs, and system monitoring for administrators." },
  { icon: Lock, title: "Data Integrity", desc: "SHA-256 hashed events, append-only logs, and role-based access control." },
];

const stats = [
  { n: "10K+", l: "Products Tracked" },
  { n: "99.9%", l: "Verification Rate" },
  { n: "50+", l: "Manufacturers" },
  { n: "24/7", l: "Fraud Monitoring" },
];

export default function Index() {
  return (
    <div className="min-h-screen flex flex-col relative z-10" style={{ color: '#dfe2eb' }}>
      {/* Nav */}
      <nav
        className="sticky top-0 z-50"
        style={{ background: 'rgba(16,20,26,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(113,255,232,0.08)' }}
      >
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/apas.png" alt="AuthentiChain Logo" className="w-8 h-8 object-contain rounded-sm" />
            <span className="font-headline font-bold text-base" style={{ color: '#00e5cc' }}>AuthentiChain</span>
          </div>
          <div className="flex items-center gap-2">
            <FlowButton size="sm" to="/verify" text="Verify" className="opacity-80 hover:opacity-100" />
            <FlowButton
              size="sm"
              to="/system-design"
              text={<span className="flex items-center gap-1"><FileText className="w-3 h-3" /> Docs</span>}
              className="opacity-80 hover:opacity-100"
            />
            <FlowButton size="sm" to="/login" text="Get Started" />
          </div>
        </div>
      </nav>
      {/* Cosmic Parallax Header Component (includes fixed background and animated text) */}
      <CosmicParallaxBg
        head="AuthentiChain"
        text="Blockchain, Supply Chain, Integrity"
        loop={true}
      />

      {/* Hero Content */}
      <section className="pb-24 lg:pb-36 relative overflow-hidden">
        {/* Background grid effect */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(rgba(113,255,232,1) 1px, transparent 1px), linear-gradient(90deg, rgba(113,255,232,1) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
        {/* Glow */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-5"
          style={{ background: 'radial-gradient(circle, #71ffe8, transparent 70%)' }}
        />

        <div className="max-w-6xl mx-auto px-6 text-center relative z-10">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            {/* Eyebrow */}
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 mb-8"
              style={{
                background: 'rgba(113,255,232,0.06)',
                border: '1px solid rgba(113,255,232,0.15)',
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: '0.65rem',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: '#71ffe8',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#71ffe8' }} />
              Blockchain-Powered Supply Chain Integrity
            </div>

            <h1
              className="font-headline text-5xl lg:text-7xl font-extrabold tracking-tighter leading-none mb-6"
              style={{ color: '#dfe2eb' }}
            >
              Stop Counterfeits.<br />
              <span style={{ color: '#71ffe8' }}>Verify Authenticity.</span>
            </h1>

            <p
              className="text-lg max-w-xl mx-auto mb-10"
              style={{ color: '#849490', fontFamily: 'Geist Sans, sans-serif', lineHeight: 1.7 }}
            >
              End-to-end product authentication with tamper-resistant tracking,
              real-time fraud detection, and instant QR verification anchored on Sepolia.
            </p>

            <div className="flex items-center justify-center gap-4 mt-4">
              <FlowButton to="/login" text="Start Free" />
              <FlowButton
                to="/verify"
                text="Verify a Product"
                className="opacity-80 hover:opacity-100"
              />
            </div>
          </motion.div>

          {/* Stats row */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-20 max-w-2xl mx-auto"
          >
            {stats.map(s => (
              <div
                key={s.l}
                className="p-4 text-center"
                style={{ background: 'rgba(22,27,34,0.8)', border: '1px solid rgba(113,255,232,0.08)' }}
              >
                <p className="font-headline text-2xl font-extrabold" style={{ color: '#71ffe8' }}>{s.n}</p>
                <p className="text-[10px] uppercase tracking-widest mt-1" style={{ color: '#849490', fontFamily: 'IBM Plex Mono, monospace' }}>{s.l}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20" style={{ background: 'rgba(22,27,34,0.5)' }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="mb-12">
            <p
              className="text-[10px] uppercase tracking-widest mb-3"
              style={{ color: '#71ffe8', fontFamily: 'IBM Plex Mono, monospace' }}
            >
              Platform Features
            </p>
            <h2 className="font-headline text-3xl lg:text-4xl font-extrabold tracking-tight" style={{ color: '#dfe2eb' }}>
              Complete Authentication Platform
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.07 }}
                viewport={{ once: true }}
                className="p-6 group transition-all"
                style={{ background: '#161B22', border: '1px solid rgba(59,74,70,0.3)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(113,255,232,0.15)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(59,74,70,0.3)'; }}
              >
                <div
                  className="w-10 h-10 flex items-center justify-center mb-4 transition-colors"
                  style={{ background: 'rgba(113,255,232,0.06)', color: '#71ffe8' }}
                >
                  <f.icon className="w-5 h-5" />
                </div>
                <h3 className="font-headline font-bold text-base mb-2" style={{ color: '#dfe2eb' }}>{f.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: '#849490' }}>{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="mb-12">
            <p className="text-[10px] uppercase tracking-widest mb-3" style={{ color: '#71ffe8', fontFamily: 'IBM Plex Mono, monospace' }}>
              Process Flow
            </p>
            <h2 className="font-headline text-3xl font-extrabold tracking-tight" style={{ color: '#dfe2eb' }}>
              How It Works
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                className="p-6 relative"
                style={{ background: '#161B22', border: '1px solid rgba(59,74,70,0.3)' }}
              >
                <div
                  className="font-headline text-4xl font-extrabold mb-3"
                  style={{ color: 'rgba(113,255,232,0.25)', fontFamily: 'IBM Plex Mono, monospace' }}
                >
                  {s.step}
                </div>
                <h3 className="font-headline font-bold text-base mb-2" style={{ color: '#dfe2eb' }}>{s.title}</h3>
                <p className="text-sm" style={{ color: '#849490' }}>{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-6">
          <div
            className="p-12 text-center relative overflow-hidden"
            style={{ background: '#00e5cc' }}
          >
            <div
              className="absolute inset-0 opacity-10"
              style={{
                backgroundImage: 'linear-gradient(rgba(0,32,27,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,32,27,1) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
              }}
            />
            <div className="relative z-10">
              <h2 className="font-headline text-3xl font-extrabold mb-4 tracking-tight" style={{ color: '#00201b' }}>
                Ready to Protect Your Products?
              </h2>
              <p className="mb-8" style={{ color: 'rgba(0,32,27,0.7)', fontFamily: 'Geist Sans, sans-serif' }}>
                Join manufacturers worldwide using AuthentiChain to combat counterfeiting.
              </p>
              <div className="flex justify-center mt-2">
                <FlowButton to="/login" text="Get Started Now" variant="dark" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <AppFooter />
    </div>
  );
}