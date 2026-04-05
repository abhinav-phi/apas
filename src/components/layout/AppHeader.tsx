import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Shield, LogOut, LogIn, LayoutDashboard, ScanLine, Home, Menu, X } from "lucide-react";

export function AppHeader({ variant = "default" }: { variant?: "default" | "dark" }) {
  const { user, loading, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const isActive = (path: string) => location.pathname === path;
  const closeMenu = () => setMobileMenuOpen(false);

  const navLinkStyle = (path: string) => ({
    color: isActive(path) ? '#71ffe8' : '#849490',
    fontFamily: 'IBM Plex Mono, monospace',
    fontSize: '0.7rem',
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    fontWeight: 600,
    padding: '0.375rem 0.75rem',
    transition: 'color 0.2s',
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
  });

  return (
    <header
      className="sticky top-0 z-50 transition-colors"
      style={{
        background: 'rgba(16,20,26,0.95)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(113,255,232,0.08)',
      }}
    >
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3" onClick={closeMenu}>
          <div className="w-8 h-8 flex items-center justify-center" style={{ background: '#00e5cc' }}>
            <Shield className="w-4 h-4" style={{ color: '#00201b' }} />
          </div>
          <span className="font-headline font-bold text-base" style={{ color: '#00e5cc' }}>
            AuthentiChain
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1">
          <Link
            to="/"
            style={navLinkStyle("/")}
            onMouseEnter={e => { if (!isActive("/")) (e.currentTarget as HTMLElement).style.color = '#dfe2eb'; }}
            onMouseLeave={e => { if (!isActive("/")) (e.currentTarget as HTMLElement).style.color = '#849490'; }}
          >
            <Home className="w-3 h-3" />
            Home
          </Link>

          <Link
            to="/verify"
            style={navLinkStyle("/verify")}
            onMouseEnter={e => { if (!isActive("/verify")) (e.currentTarget as HTMLElement).style.color = '#dfe2eb'; }}
            onMouseLeave={e => { if (!isActive("/verify")) (e.currentTarget as HTMLElement).style.color = '#849490'; }}
          >
            <ScanLine className="w-3 h-3" />
            Verify
          </Link>

          {!loading && user && (
            <Link
              to="/dashboard"
              style={navLinkStyle("/dashboard")}
              onMouseEnter={e => { if (!isActive("/dashboard")) (e.currentTarget as HTMLElement).style.color = '#dfe2eb'; }}
              onMouseLeave={e => { if (!isActive("/dashboard")) (e.currentTarget as HTMLElement).style.color = '#849490'; }}
            >
              <LayoutDashboard className="w-3 h-3" />
              Dashboard
            </Link>
          )}

          {/* Divider */}
          <div className="w-px h-4 mx-2" style={{ background: 'rgba(59,74,70,0.5)' }} />

          {!loading && (
            user ? (
              <button
                onClick={handleSignOut}
                style={{
                  ...navLinkStyle("/"),
                  color: '#849490',
                  cursor: 'pointer',
                  border: 'none',
                  background: 'transparent',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ffb4ab'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#849490'; }}
              >
                <LogOut className="w-3 h-3" />
                Logout
              </button>
            ) : (
              <Link
                to="/login"
                style={{
                  ...navLinkStyle("/login"),
                  background: 'rgba(113,255,232,0.06)',
                  border: '1px solid rgba(113,255,232,0.15)',
                  color: '#71ffe8',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(113,255,232,0.1)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(113,255,232,0.06)'; }}
              >
                <LogIn className="w-3 h-3" />
                Login
              </Link>
            )
          )}
        </nav>

        {/* Mobile toggle */}
        <button
          className="md:hidden p-2 transition-colors"
          style={{ color: '#71ffe8' }}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div
          className="md:hidden px-4 py-4 space-y-1"
          style={{ borderTop: '1px solid rgba(113,255,232,0.08)', background: '#10141a' }}
        >
          {[
            { to: "/", icon: <Home className="w-4 h-4" />, label: "Home" },
            { to: "/verify", icon: <ScanLine className="w-4 h-4" />, label: "Verify" },
            ...(user ? [{ to: "/dashboard", icon: <LayoutDashboard className="w-4 h-4" />, label: "Dashboard" }] : []),
          ].map(item => (
            <Link
              key={item.to}
              to={item.to}
              onClick={closeMenu}
              className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
              style={{
                color: isActive(item.to) ? '#71ffe8' : '#849490',
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: '0.7rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
          {user ? (
            <button
              onClick={() => { closeMenu(); handleSignOut(); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left"
              style={{ color: '#ffb4ab', fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          ) : (
            <Link
              to="/login"
              onClick={closeMenu}
              className="flex items-center gap-3 px-4 py-2.5 text-sm"
              style={{ color: '#71ffe8', fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}
            >
              <LogIn className="w-4 h-4" />
              Login
            </Link>
          )}
        </div>
      )}
    </header>
  );
}