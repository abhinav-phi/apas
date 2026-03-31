import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Shield, LogOut, LogIn, LayoutDashboard, ScanLine, Home, Menu, X } from "lucide-react";

/**
 * Shared top-level navigation bar used on all public-facing pages.
 * Shows: Home, Verify, Dashboard (if logged in), Login / Logout.
 *
 * Accepts an optional `variant` prop:
 *   - "default"  → light card background (for Index, Auth, SystemDesign, NotFound)
 *   - "dark"     → dark translucent background (for Verify page)
 */
export function AppHeader({ variant = "default" }: { variant?: "default" | "dark" }) {
  const { user, loading, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isDark = variant === "dark";

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const isActive = (path: string) => location.pathname === path;

  const linkClass = (path: string) => {
    const base = isDark
      ? "text-sm font-medium transition-colors"
      : "text-sm font-medium transition-colors";
    const active = isDark
      ? "text-white"
      : "text-foreground";
    const inactive = isDark
      ? "text-white/60 hover:text-white"
      : "text-muted-foreground hover:text-foreground";
    return `${base} ${isActive(path) ? active : inactive}`;
  };

  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <header
      className={`border-b sticky top-0 z-50 transition-colors ${
        isDark
          ? "border-white/10 bg-black/50 backdrop-blur-xl"
          : "border-border bg-card/90 backdrop-blur-xl"
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5" onClick={closeMenu}>
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Shield className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className={`font-bold text-sm ${isDark ? "text-white" : ""}`}>
            AuthentiChain
          </span>
        </Link>
        <div className="flex items-center gap-2 md:hidden">
          {/* Mobile menu toggle */}
          <button
            className={`p-2 rounded-md ${isDark ? "text-white hover:bg-white/10" : "text-foreground hover:bg-accent"}`}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1">
          <Link to="/" className={linkClass("/")}>
            <Button
              variant="ghost"
              size="sm"
              className={isDark ? "text-inherit hover:bg-white/10 hover:text-white" : "text-inherit"}
            >
              <Home className="w-3.5 h-3.5 mr-1.5" />
              Home
            </Button>
          </Link>

          <Link to="/verify" className={linkClass("/verify")}>
            <Button
              variant="ghost"
              size="sm"
              className={isDark ? "text-inherit hover:bg-white/10 hover:text-white" : "text-inherit"}
            >
              <ScanLine className="w-3.5 h-3.5 mr-1.5" />
              Verify
            </Button>
          </Link>

          {!loading && user && (
            <Link to="/dashboard" className={linkClass("/dashboard")}>
              <Button
                variant="ghost"
                size="sm"
                className={isDark ? "text-inherit hover:bg-white/10 hover:text-white" : "text-inherit"}
              >
                <LayoutDashboard className="w-3.5 h-3.5 mr-1.5" />
                Dashboard
              </Button>
            </Link>
          )}

          <div className={`w-px h-5 mx-1 ${isDark ? "bg-white/15" : "bg-border"}`} />

          {!loading && (
            user ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className={isDark
                  ? "text-white/60 hover:text-white hover:bg-white/10"
                  : "text-muted-foreground hover:text-foreground"
                }
              >
                <LogOut className="w-3.5 h-3.5 mr-1.5" />
                Logout
              </Button>
            ) : (
              <Link to="/login">
                <Button
                  variant="ghost"
                  size="sm"
                  className={isDark
                    ? "text-white/60 hover:text-white hover:bg-white/10"
                    : "text-muted-foreground hover:text-foreground"
                  }
                >
                  <LogIn className="w-3.5 h-3.5 mr-1.5" />
                  Login
                </Button>
              </Link>
            )
          )}
        </nav>
      </div>

      {/* Mobile Nav */}
      {mobileMenuOpen && (
        <div className={`md:hidden border-t ${isDark ? "border-white/10 bg-black/90" : "border-border bg-card"} px-4 py-4 space-y-2`}>
          <Link to="/" onClick={closeMenu} className={`flex items-center gap-2 p-2 rounded-md ${isDark ? "text-white hover:bg-white/10" : "hover:bg-accent hover:text-accent-foreground"}`}>
            <Home className="w-4 h-4" /> Home
          </Link>
          <Link to="/verify" onClick={closeMenu} className={`flex items-center gap-2 p-2 rounded-md ${isDark ? "text-white hover:bg-white/10" : "hover:bg-accent hover:text-accent-foreground"}`}>
            <ScanLine className="w-4 h-4" /> Verify
          </Link>
          {!loading && user && (
            <Link to="/dashboard" onClick={closeMenu} className={`flex items-center gap-2 p-2 rounded-md ${isDark ? "text-white hover:bg-white/10" : "hover:bg-accent hover:text-accent-foreground"}`}>
              <LayoutDashboard className="w-4 h-4" /> Dashboard
            </Link>
          )}
          {!loading && (
            user ? (
              <button
                onClick={() => { closeMenu(); handleSignOut(); }}
                className={`w-full flex items-center gap-2 p-2 rounded-md ${isDark ? "text-white hover:bg-white/10" : "hover:bg-accent hover:text-accent-foreground"}`}
              >
                <LogOut className="w-4 h-4" /> Logout
              </button>
            ) : (
              <Link to="/login" onClick={closeMenu} className={`flex items-center gap-2 p-2 rounded-md ${isDark ? "text-white hover:bg-white/10" : "hover:bg-accent hover:text-accent-foreground"}`}>
                <LogIn className="w-4 h-4" /> Login
              </Link>
            )
          )}
        </div>
      )}
    </header>
  );
}
