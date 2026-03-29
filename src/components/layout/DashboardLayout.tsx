import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Package, BarChart3, Shield, QrCode, Truck, Users, AlertTriangle,
  LogOut, Menu, X, ChevronRight, Home, FileText, Bell
} from "lucide-react";

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

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, role, profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = role ? roleNavItems[role] || [] : [];

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-sidebar text-sidebar-foreground transform transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
            <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
              <Shield className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-sidebar-primary-foreground">AuthentiChain</h1>
              <p className="text-xs text-sidebar-foreground/60">{role ? roleLabels[role] : ""}</p>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {navItems.length > 0 ? (
              navItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-sidebar-accent text-sidebar-primary"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    }`}
                  >
                    {item.icon}
                    {item.label}
                    {isActive && <ChevronRight className="w-3 h-3 ml-auto" />}
                  </Link>
                );
              })
            ) : (
              <div className="px-3 py-4 text-center">
                <div className="animate-pulse space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-8 rounded-lg bg-sidebar-accent/50" />
                  ))}
                </div>
                <p className="text-xs text-sidebar-foreground/50 mt-3">Loading navigation...</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-2 text-xs text-sidebar-primary hover:underline"
                >
                  Refresh if stuck
                </button>
              </div>
            )}
          </nav>

          {/* User info */}
          <div className="px-4 py-4 border-t border-sidebar-border">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-semibold text-sidebar-primary">
                {profile?.full_name?.charAt(0)?.toUpperCase() || "U"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-primary-foreground truncate">{profile?.full_name || "User"}</p>
                <p className="text-xs text-sidebar-foreground/60 truncate">{user?.email}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-primary-foreground" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-2" /> Sign Out
            </Button>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main */}
      <div className="flex-1 lg:ml-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-4 px-4 lg:px-8 py-3 bg-background/80 backdrop-blur-xl border-b border-border">
          <button className="lg:hidden p-2 rounded-lg hover:bg-accent" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex-1" />
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="w-5 h-5 text-muted-foreground" />
          </Button>
        </header>

        {/* Content */}
        <main className="p-4 lg:p-8 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
