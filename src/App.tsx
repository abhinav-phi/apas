import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { AnimatePresence } from "framer-motion";
import "./lib/i18n";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import ProductDetail from "./pages/ProductDetail";
import Batches from "./pages/Batches";
import QRCodes from "./pages/QRCodes";
import SupplyChain from "./pages/SupplyChain";
import TransferOwnership from "./pages/TransferOwnership";
import ScanUpdate from "./pages/ScanUpdate";
import Verify from "./pages/Verify";
import Alerts from "./pages/Alerts";
import Analytics from "./pages/Analytics";
import AuditLogs from "./pages/AuditLogs";
import UsersPage from "./pages/Users";
import MyProducts from "./pages/MyProducts";
import Settings from "./pages/Settings";
import SystemDesign from "./pages/SystemDesign";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ background: "#10141a" }}>
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#71ffe8", borderTopColor: "transparent" }} />
        <p className="text-sm" style={{ color: "#849490", fontFamily: "IBM Plex Mono, monospace" }}>AUTHENTICATING...</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!role) return <Navigate to="/auth" replace />;
  if (allowedRoles && !allowedRoles.includes(role)) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: "#10141a", color: "#849490" }}>Loading...</div>;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ErrorBoundary>
            <AnimatePresence mode="wait">
              <Routes>
              {/* Public */}
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<PublicOnlyRoute><Auth initialMode="login" /></PublicOnlyRoute>} />
              <Route path="/register" element={<PublicOnlyRoute><Auth initialMode="register" /></PublicOnlyRoute>} />
              <Route path="/auth" element={<Navigate to="/login" replace />} />
              <Route path="/verify" element={<Verify />} />
              <Route path="/system-design" element={<SystemDesign />} />

              {/* Protected — all authenticated users */}
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

              {/* Manufacturer + Admin */}
              <Route path="/products" element={<ProtectedRoute allowedRoles={["manufacturer", "admin"]}><Products /></ProtectedRoute>} />
              <Route path="/products/:id" element={<ProtectedRoute allowedRoles={["manufacturer", "admin"]}><ProductDetail /></ProtectedRoute>} />
              <Route path="/alerts" element={<ProtectedRoute allowedRoles={["manufacturer", "admin"]}><Alerts /></ProtectedRoute>} />

              {/* Manufacturer only */}
              <Route path="/batches" element={<ProtectedRoute allowedRoles={["manufacturer"]}><Batches /></ProtectedRoute>} />
              <Route path="/qr-codes" element={<ProtectedRoute allowedRoles={["manufacturer"]}><QRCodes /></ProtectedRoute>} />

              {/* Manufacturer + Supplier */}
              <Route path="/supply-chain" element={<ProtectedRoute allowedRoles={["manufacturer", "supplier"]}><SupplyChain /></ProtectedRoute>} />
              <Route path="/transfer-ownership" element={<ProtectedRoute allowedRoles={["manufacturer", "supplier"]}><TransferOwnership /></ProtectedRoute>} />

              {/* Supplier only */}
              <Route path="/scan-update" element={<ProtectedRoute allowedRoles={["supplier"]}><ScanUpdate /></ProtectedRoute>} />

              {/* Customer only */}
              <Route path="/my-products" element={<ProtectedRoute allowedRoles={["customer"]}><MyProducts /></ProtectedRoute>} />

              {/* Admin only */}
              <Route path="/analytics" element={<ProtectedRoute allowedRoles={["admin"]}><Analytics /></ProtectedRoute>} />
              <Route path="/audit-logs" element={<ProtectedRoute allowedRoles={["admin"]}><AuditLogs /></ProtectedRoute>} />
              <Route path="/users" element={<ProtectedRoute allowedRoles={["admin"]}><UsersPage /></ProtectedRoute>} />

              <Route path="*" element={<NotFound />} />
              </Routes>
            </AnimatePresence>
          </ErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
