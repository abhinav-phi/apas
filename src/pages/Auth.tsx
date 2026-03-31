import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppFooter } from "@/components/layout/AppFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, ArrowRight, Package, Truck, Users, BarChart3 } from "lucide-react";
import { motion } from "framer-motion";

type AppRole = "manufacturer" | "supplier" | "customer" | "admin";

export default function AuthPage({ initialMode = "login" }: { initialMode?: "login" | "register" }) {
  const [isSignUp, setIsSignUp] = useState(initialMode === "register");

  useEffect(() => {
    setIsSignUp(initialMode === "register");
  }, [initialMode]);
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

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      <div className="flex-1 flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-primary relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_70%,rgba(255,255,255,0.1),transparent_50%)]" />
        <div className="relative z-10 flex flex-col justify-center px-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 rounded-xl bg-primary-foreground/20 backdrop-blur flex items-center justify-center">
                <Shield className="w-6 h-6 text-primary-foreground" />
              </div>
              <h1 className="text-3xl font-bold text-primary-foreground">AuthentiChain</h1>
            </div>
            <h2 className="text-4xl font-bold text-primary-foreground leading-tight mb-4">
              Protect Your Products.<br />Verify Authenticity.
            </h2>
            <p className="text-lg text-primary-foreground/80 max-w-md">
              End-to-end supply chain integrity with tamper-resistant tracking, fraud detection, and instant verification.
            </p>
            <div className="mt-12 grid grid-cols-2 gap-4 max-w-sm">
              {[
                { n: "10K+", l: "Products Tracked" },
                { n: "99.9%", l: "Verification Rate" },
                { n: "50+", l: "Manufacturers" },
                { n: "24/7", l: "Fraud Monitoring" },
              ].map((s) => (
                <div key={s.l} className="bg-primary-foreground/10 rounded-lg p-3 backdrop-blur">
                  <p className="text-2xl font-bold text-primary-foreground">{s.n}</p>
                  <p className="text-xs text-primary-foreground/70">{s.l}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-background">
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 0.1 }} className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-bold">AuthentiChain</h1>
          </div>

          <h2 className="text-2xl font-bold mb-1">{isSignUp ? "Create Account" : "Welcome Back"}</h2>
          <p className="text-sm text-muted-foreground mb-6">
            {isSignUp ? "Set up your account to get started" : "Sign in to your dashboard"}
          </p>

          {error && (
            <div className="bg-destructive/10 text-destructive text-sm rounded-lg p-3 mb-4 border border-destructive/20">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <>
                <div>
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="John Doe" />
                </div>

                <div>
                  <Label className="mb-2 block">Select Your Role</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {roles.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => setRole(r.value)}
                        className={`p-3 rounded-lg border text-left transition-all ${
                          role === r.value ? "border-primary bg-accent ring-1 ring-primary" : "border-border hover:border-primary/50"
                        }`}
                      >
                        <r.icon className={`w-4 h-4 mb-1 ${role === r.value ? "text-primary" : "text-muted-foreground"}`} />
                        <p className="text-sm font-medium">{r.label}</p>
                        <p className="text-xs text-muted-foreground">{r.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {(role === "manufacturer" || role === "supplier") && (
                  <div>
                    <Label htmlFor="companyName">Company Name</Label>
                    <Input id="companyName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Inc." />
                  </div>
                )}
              </>
            )}

            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@company.com" />
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" minLength={6} />
            </div>

            <Button type="submit" variant="hero" size="lg" className="w-full" disabled={loading}>
              {loading ? "Please wait..." : isSignUp ? "Create Account" : "Sign In"}
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </form>

          <p className="text-sm text-center text-muted-foreground mt-6">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <Link
              to={isSignUp ? "/login" : "/register"}
              className="text-primary font-medium hover:underline"
              onClick={() => setError("")}
            >
              {isSignUp ? "Sign In" : "Sign Up"}
            </Link>
          </p>

          <div className="mt-6 text-center">
            <Link to="/verify" className="text-sm text-muted-foreground hover:text-primary transition-colors">
              Verify a product without signing in →
            </Link>
          </div>
        </motion.div>
      </div>
      </div>
      <AppFooter />
    </div>
  );
}
