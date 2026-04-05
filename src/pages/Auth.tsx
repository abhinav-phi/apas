import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AppFooter } from "@/components/layout/AppFooter";
import { FlowButton } from "@/components/ui/flow-button";
import { Shield, ArrowRight, Package, Truck, Users, BarChart3 } from "lucide-react";
import { motion } from "framer-motion";

type AppRole = "manufacturer" | "supplier" | "customer" | "admin";

export default function AuthPage({ initialMode = "login" }: { initialMode?: "login" | "register" }) {
  const [isSignUp, setIsSignUp] = useState(initialMode === "register");
  useEffect(() => { setIsSignUp(initialMode === "register"); }, [initialMode]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [role, setRole] = useState<AppRole>("manufacturer");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isSignUp) {
        await signUp(email, password, fullName, role, companyName || undefined);
      } else {
        await signIn(email, password);
      }
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const roles: { value: AppRole; label: string; icon: typeof Package; desc: string }[] = [
    { value: "manufacturer", label: "Manufacturer", icon: Package, desc: "Register & manage products" },
    { value: "supplier", label: "Supplier", icon: Truck, desc: "Track & distribute products" },
    { value: "customer", label: "Customer", icon: Users, desc: "Verify product authenticity" },
    { value: "admin", label: "Admin", icon: BarChart3, desc: "Monitor & audit system" },
  ];

  const baseInputStyle: React.CSSProperties = {
    background: '#0a0e14',
    border: '1px solid rgba(59,74,70,0.5)',
    borderRadius: '0',
    color: '#dfe2eb',
    fontFamily: 'Geist Sans, sans-serif',
    fontSize: '0.875rem',
    padding: '0.625rem 0.875rem',
    width: '100%',
    outline: 'none',
    transition: 'border-color 0.2s',
  };

  const gridBg = {
    backgroundImage: 'linear-gradient(rgba(0,32,27,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,32,27,1) 1px, transparent 1px)',
    backgroundSize: '50px 50px',
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#10141a' }}>
      <div className="flex-1 flex">
        {/* Left panel */}
        <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col justify-center px-16" style={{ background: '#00e5cc' }}>
          <div className="absolute inset-0 opacity-10" style={gridBg} />
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="relative z-10">
            <div className="flex items-center gap-3 mb-10">
              <img src="/apas.png" alt="AuthentiChain Logo" className="w-10 h-10 object-contain rounded-sm bg-[#00201b]" />
              <h1 className="font-headline font-bold text-2xl" style={{ color: '#00201b' }}>AuthentiChain</h1>
            </div>
            <h2 className="font-headline text-4xl font-extrabold leading-tight mb-4 tracking-tight" style={{ color: '#00201b' }}>
              Protect Your Products.<br />Verify Authenticity.
            </h2>
            <p className="text-base max-w-md mb-12" style={{ color: 'rgba(0,32,27,0.7)', fontFamily: 'Geist Sans, sans-serif', lineHeight: 1.7 }}>
              End-to-end supply chain integrity with tamper-resistant tracking, fraud detection, and instant verification.
            </p>
            <div className="grid grid-cols-2 gap-3 max-w-sm">
              {[{ n: "10K+", l: "Products" }, { n: "99.9%", l: "Verification" }, { n: "50+", l: "Manufacturers" }, { n: "24/7", l: "Monitoring" }].map(s => (
                <div key={s.l} className="p-3" style={{ background: 'rgba(0,32,27,0.12)' }}>
                  <p className="font-headline text-2xl font-extrabold" style={{ color: '#00201b' }}>{s.n}</p>
                  <p className="text-[10px] uppercase tracking-widest mt-0.5" style={{ color: 'rgba(0,32,27,0.6)', fontFamily: 'IBM Plex Mono, monospace' }}>{s.l}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Right panel */}
        <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 0.1 }} className="w-full max-w-md">
            <div className="lg:hidden flex items-center gap-3 mb-8">
              <img src="/apas.png" alt="AuthentiChain Logo" className="w-8 h-8 object-contain rounded-sm bg-[#00e5cc]" />
              <h1 className="font-headline font-bold text-base" style={{ color: '#00e5cc' }}>AuthentiChain</h1>
            </div>

            <div className="mb-8">
              <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: '#71ffe8', fontFamily: 'IBM Plex Mono, monospace' }}>
                {isSignUp ? "Create Account" : "Welcome Back"}
              </p>
              <h2 className="font-headline text-2xl font-extrabold tracking-tight" style={{ color: '#dfe2eb' }}>
                {isSignUp ? "Get Started" : "Sign In"}
              </h2>
            </div>

            {error && (
              <div className="px-4 py-3 mb-6 text-sm" style={{ background: 'rgba(255,180,171,0.08)', border: '1px solid rgba(255,180,171,0.25)', color: '#ffb4ab', fontFamily: 'Geist Sans, sans-serif' }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignUp && (
                <>
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest mb-2" style={{ color: '#849490', fontFamily: 'IBM Plex Mono, monospace' }}>Full Name</label>
                    <input value={fullName} onChange={e => setFullName(e.target.value)} required placeholder="John Doe" style={baseInputStyle}
                      onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#71ffe8'; }}
                      onBlur={e => { (e.target as HTMLInputElement).style.borderColor = 'rgba(59,74,70,0.5)'; }} />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest mb-2" style={{ color: '#849490', fontFamily: 'IBM Plex Mono, monospace' }}>Select Role</label>
                    <div className="grid grid-cols-2 gap-2">
                      {roles.map(r => (
                        <button key={r.value} type="button" onClick={() => setRole(r.value)} className="p-3 text-left transition-all"
                          style={role === r.value ? { background: 'rgba(113,255,232,0.06)', border: '1px solid rgba(113,255,232,0.3)' } : { background: '#0a0e14', border: '1px solid rgba(59,74,70,0.4)' }}>
                          <r.icon className="w-4 h-4 mb-1" style={{ color: role === r.value ? '#71ffe8' : '#849490' }} />
                          <p className="text-xs font-bold" style={{ color: role === r.value ? '#71ffe8' : '#dfe2eb', fontFamily: 'Geist Sans, sans-serif' }}>{r.label}</p>
                          <p className="text-[10px] mt-0.5" style={{ color: '#849490', fontFamily: 'Geist Sans, sans-serif' }}>{r.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                  {(role === "manufacturer" || role === "supplier") && (
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest mb-2" style={{ color: '#849490', fontFamily: 'IBM Plex Mono, monospace' }}>Company Name</label>
                      <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Acme Inc." style={baseInputStyle}
                        onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#71ffe8'; }}
                        onBlur={e => { (e.target as HTMLInputElement).style.borderColor = 'rgba(59,74,70,0.5)'; }} />
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="block text-[10px] uppercase tracking-widest mb-2" style={{ color: '#849490', fontFamily: 'IBM Plex Mono, monospace' }}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@company.com" style={baseInputStyle}
                  onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#71ffe8'; }}
                  onBlur={e => { (e.target as HTMLInputElement).style.borderColor = 'rgba(59,74,70,0.5)'; }} />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest mb-2" style={{ color: '#849490', fontFamily: 'IBM Plex Mono, monospace' }}>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" minLength={6} style={baseInputStyle}
                  onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#71ffe8'; }}
                  onBlur={e => { (e.target as HTMLInputElement).style.borderColor = 'rgba(59,74,70,0.5)'; }} />
              </div>

              <FlowButton
                type="submit"
                disabled={loading}
                size="full"
                text={loading ? "Please wait..." : isSignUp ? "Create Account" : "Sign In"}
              />
            </form>

            <p className="text-sm text-center mt-6" style={{ color: '#849490', fontFamily: 'Geist Sans, sans-serif' }}>
              {isSignUp ? "Already have an account?" : "Don't have an account?"}
            </p>
            <div className="flex justify-center mt-4">
              <FlowButton
                to={isSignUp ? "/login" : "/register"}
                size="sm"
                text={isSignUp ? "Sign In" : "Sign Up"}
                onClick={() => setError("")}
              />
            </div>
            <div className="mt-8 flex justify-center">
              <FlowButton
                to="/verify"
                size="sm"
                text="Verify a product without signing in"
                className="opacity-60 hover:opacity-100"
              />
            </div>
          </motion.div>
        </div>
      </div>
      <AppFooter />
    </div>
  );
}