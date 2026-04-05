import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Package, BarChart3, Shield, QrCode, Truck, Users, AlertTriangle,
  LogOut, Menu, X, ChevronRight, Home, FileText, Bell
} from "lucide-react";
import { FlowButton } from "@/components/ui/flow-button";

const roleNavItems: Record<string, { label: string; path: string; icon: ReactNode }[]> = {
  manufacturer: [
    { label: "Dashboard", path: "/dashboard", icon: <Home className="w-4 h-4" /> },
    { label: "Products", path: "/products", icon: <Package className="w-4 h-4" /> },
    { label: "Batches", path: "/batches", icon: <FileText className="w-4 h-4" /> },
    { label: "QR Codes", path: "/qr-codes", icon: <QrCode className="w-4 h-4" /> },
    { label: "Supply Chain", path: "/supply-chain", icon: <Truck className="w-4 h-4" /> },
    { label: "Alerts", path: "/alerts", icon: <AlertTriangle className="w-4 h-4" /> },
  ],
  supplier: [
    { label: "Dashboard", path: "/dashboard", icon: <Home className="w-4 h-4" /> },
    { label: "Scan & Update", path: "/scan-update", icon: <QrCode className="w-4 h-4" /> },
    { label: "Supply Chain", path: "/supply-chain", icon: <Truck className="w-4 h-4" /> },
  ],
  customer: [
    { label: "Dashboard", path: "/dashboard", icon: <Home className="w-4 h-4" /> },
    { label: "Verify Product", path: "/verify", icon: <Shield className="w-4 h-4" /> },
    { label: "My Products", path: "/my-products", icon: <Package className="w-4 h-4" /> },
  ],
  admin: [
    { label: "Dashboard", path: "/dashboard", icon: <Home className="w-4 h-4" /> },
    { label: "Products", path: "/products", icon: <Package className="w-4 h-4" /> },
    { label: "Users", path: "/users", icon: <Users className="w-4 h-4" /> },
    { label: "Fraud Alerts", path: "/alerts", icon: <AlertTriangle className="w-4 h-4" /> },
    { label: "Analytics", path: "/analytics", icon: <BarChart3 className="w-4 h-4" /> },
    { label: "Audit Logs", path: "/audit-logs", icon: <FileText className="w-4 h-4" /> },
  ],
};

const roleLabels: Record<string, string> = {
  manufacturer: "Manufacturer",
  supplier: "Supplier / Distributor",
  customer: "Customer",
  admin: "Admin / Auditor",
};

const roleColors: Record<string, string> = {
  manufacturer: "text-[#71ffe8]",
  supplier: "text-[#f9bc48]",
  customer: "text-[#71ffe8]",
  admin: "text-[#ffb4ab]",
};

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, role, profile, signOut } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = role ? roleNavItems[role] || [] : [];

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen flex" style={{ background: '#10141a' }}>
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[240px] flex flex-col transform transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ background: '#161B22', borderRight: '1px solid rgba(113,255,232,0.1)' }}
      >
        {/* Logo */}
        <Link
          to="/dashboard"
          className="flex items-center gap-3 px-6 py-5 transition-colors"
          style={{ borderBottom: '1px solid rgba(113,255,232,0.08)' }}
          onClick={() => setSidebarOpen(false)}
        >
          <img src="/apas.png" alt="AuthentiChain Logo" className="w-8 h-8 object-contain rounded-sm" />
          <div>
            <h1 className="font-headline font-bold text-base leading-none" style={{ color: '#00e5cc' }}>
              AuthentiChain
            </h1>
            <p className="text-[10px] uppercase tracking-widest mt-0.5" style={{ color: '#849490', fontFamily: 'IBM Plex Mono, monospace' }}>
              {role ? roleLabels[role] : 'Loading...'}
            </p>
          </div>
        </Link>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <Link
            to="/"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
            style={{ color: '#849490' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#dfe2eb'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#849490'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <Home className="w-4 h-4" />
            <span style={{ fontFamily: 'Geist Sans, sans-serif' }}>Back to Home</span>
          </Link>

          <div className="my-2" style={{ height: '1px', background: 'rgba(113,255,232,0.06)' }} />

          {navItems.length > 0 ? navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm transition-all"
                style={isActive ? {
                  color: '#00e5cc',
                  background: 'rgba(113,255,232,0.05)',
                  borderLeft: '4px solid #71ffe8',
                } : {
                  color: '#849490',
                  borderLeft: '4px solid transparent',
                }}
                onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.color = '#dfe2eb'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; } }}
                onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.color = '#849490'; (e.currentTarget as HTMLElement).style.background = 'transparent'; } }}
              >
                {item.icon}
                <span style={{ fontFamily: 'Geist Sans, sans-serif', fontWeight: isActive ? 500 : 400 }}>{item.label}</span>
                {isActive && <ChevronRight className="w-3 h-3 ml-auto" style={{ color: '#71ffe8' }} />}
              </Link>
            );
          }) : (
            <div className="px-3 py-4 text-center">
              <div className="space-y-2 animate-pulse">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-8 rounded-sm" style={{ background: 'rgba(113,255,232,0.05)' }} />
                ))}
              </div>
              <p className="text-xs mt-3" style={{ color: '#849490', fontFamily: 'IBM Plex Mono, monospace' }}>
                LOADING...
              </p>
            </div>
          )}
        </nav>

        {/* User info + sign out */}
        <div className="p-4" style={{ borderTop: '1px solid rgba(113,255,232,0.06)' }}>
          {/* Scan product CTA */}
          {/* Scan product CTA */}
          <div className="mb-4">
            <FlowButton
              to="/verify"
              size="full"
              text={<span className="flex items-center gap-2"><QrCode className="w-3.5 h-3.5 inline" /> Scan Product</span>}
            />
          </div>

          {/* User row */}
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-8 h-8 flex items-center justify-center text-xs font-bold"
              style={{ background: 'rgba(113,255,232,0.1)', color: '#71ffe8', fontFamily: 'IBM Plex Mono, monospace' }}
            >
              {profile?.full_name?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: '#dfe2eb', fontFamily: 'Geist Sans, sans-serif' }}>
                {profile?.full_name || "User"}
              </p>
              <p className="text-[10px] truncate" style={{ color: '#849490', fontFamily: 'IBM Plex Mono, monospace' }}>
                {user?.email}
              </p>
            </div>
          </div>

          <div className="mt-2">
            <FlowButton
              onClick={handleSignOut}
              size="sm"
              className="opacity-70 hover:opacity-100"
              text={<span className="flex items-center gap-2"><LogOut className="w-3.5 h-3.5" /> SIGN OUT</span>}
            />
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex-1 lg:ml-[240px]">
        {/* Top bar */}
        <header
          className="sticky top-0 z-30 flex items-center gap-4 px-6 lg:px-8 py-4"
          style={{ background: '#10141a', borderBottom: '1px solid rgba(113,255,232,0.08)' }}
        >
          <button
            className="lg:hidden p-2 transition-colors"
            style={{ color: '#849490' }}
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          {/* Brand in top bar (desktop) */}
          <div className="hidden lg:flex items-center gap-4">
            <h2 className="font-headline font-black tracking-tighter text-xl uppercase" style={{ color: '#71ffe8' }}>
              AuthentiChain
            </h2>
            <div className="h-4 w-px" style={{ background: 'rgba(59,74,70,0.6)' }} />
            <div className="flex items-center gap-1.5 text-xs" style={{ color: '#849490', fontFamily: 'IBM Plex Mono, monospace' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#71ffe8] animate-pulse" />
              NODE: ACTIVE
            </div>
          </div>

          <div className="flex-1" />

          {/* Notification */}
          <button
            className="relative p-2 transition-colors"
            style={{ color: '#849490' }}
            onClick={() => toast({ title: "No new notifications", description: "You're all caught up." })}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#71ffe8'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#849490'; }}
          >
            <Bell className="w-5 h-5" />
          </button>

          {/* Role badge */}
          {role && (
            <div
              className="hidden sm:flex items-center gap-2 px-3 py-1.5"
              style={{ background: 'rgba(113,255,232,0.05)', border: '1px solid rgba(113,255,232,0.1)' }}
            >
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#71ffe8', fontFamily: 'IBM Plex Mono, monospace' }}>
                {role}
              </span>
            </div>
          )}
        </header>

        {/* Content */}
        <main className="p-4 lg:p-8 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}