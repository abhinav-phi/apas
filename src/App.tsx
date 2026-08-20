import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { AnimatePresence } from "framer-motion";
import "./lib/i18n";

const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Products = lazy(() => import("./pages/Products"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const Batches = lazy(() => import("./pages/Batches"));
const QRCodes = lazy(() => import("./pages/QRCodes"));
const SupplyChain = lazy(() => import("./pages/SupplyChain"));
const TransferOwnership = lazy(() => import("./pages/TransferOwnership"));
const ScanUpdate = lazy(() => import("./pages/ScanUpdate"));
const Verify = lazy(() => import("./pages/Verify"));
const Alerts = lazy(() => import("./pages/Alerts"));
const Analytics = lazy(() => import("./pages/Analytics"));
const AuditLogs = lazy(() => import("./pages/AuditLogs"));
const UsersPage = lazy(() => import("./pages/Users"));
const MyProducts = lazy(() => import("./pages/MyProducts"));
const Settings = lazy(() => import("./pages/Settings"));
const SystemDesign = lazy(() => import("./pages/SystemDesign"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function RouteLoader() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-3"
      style={{ background: "#10141a" }}
    >
      <div
        className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: "#71ffe8", borderTopColor: "transparent" }}
      />
      <p
        className="text-sm"
        style={{ color: "#849490", fontFamily: "IBM Plex Mono, monospace" }}
      >
        LOADING...
      </p>
    </div>
  );
}

function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: string[];
}) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-3"
        style={{ background: "#10141a" }}
      >
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "#71ffe8", borderTopColor: "transparent" }}
        />
        <p
          className="text-sm"
          style={{ color: "#849490", fontFamily: "IBM Plex Mono, monospace" }}
        >
          AUTHENTICATING...
        </p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!role) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(role)) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#10141a", color: "#849490" }}
      >
        Loading...
      </div>
    );
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
              <Suspense fallback={<RouteLoader />}>
                <Routes>
                  {/* Public */}
                  <Route path="/" element={<Index />} />
                  <Route
                    path="/login"
                    element={
                      <PublicOnlyRoute>
                        <Auth initialMode="login" />
                      </PublicOnlyRoute>
                    }
                  />
                  <Route
                    path="/register"
                    element={
                      <PublicOnlyRoute>
                        <Auth initialMode="register" />
                      </PublicOnlyRoute>
                    }
                  />
                  <Route path="/auth" element={<Navigate to="/login" replace />} />
                  <Route path="/verify" element={<Verify />} />
                  <Route path="/system-design" element={<SystemDesign />} />

                  {/* Protected — all authenticated users */}
                  <Route
                    path="/dashboard"
                    element={
                      <ProtectedRoute>
                        <Dashboard />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/settings"
                    element={
                      <ProtectedRoute>
                        <Settings />
                      </ProtectedRoute>
                    }
                  />

                  {/* Manufacturer + Admin */}
                  <Route
                    path="/products"
                    element={
                      <ProtectedRoute allowedRoles={["manufacturer", "admin"]}>
                        <Products />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/products/:id"
                    element={
                      <ProtectedRoute allowedRoles={["manufacturer", "admin"]}>
                        <ProductDetail />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/alerts"
                    element={
                      <ProtectedRoute allowedRoles={["manufacturer", "admin"]}>
                        <Alerts />
                      </ProtectedRoute>
                    }
                  />

                  {/* Manufacturer only */}
                  <Route
                    path="/batches"
                    element={
                      <ProtectedRoute allowedRoles={["manufacturer"]}>
                        <Batches />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/qr-codes"
                    element={
                      <ProtectedRoute allowedRoles={["manufacturer"]}>
                        <QRCodes />
                      </ProtectedRoute>
                    }
                  />

                  {/* Manufacturer + Supplier */}
                  <Route
                    path="/supply-chain"
                    element={
                      <ProtectedRoute allowedRoles={["manufacturer", "supplier"]}>
                        <SupplyChain />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/transfer-ownership"
                    element={
                      <ProtectedRoute allowedRoles={["manufacturer", "supplier"]}>
                        <TransferOwnership />
                      </ProtectedRoute>
                    }
                  />

                  {/* Supplier only */}
                  <Route
                    path="/scan-update"
                    element={
                      <ProtectedRoute allowedRoles={["supplier"]}>
                        <ScanUpdate />
                      </ProtectedRoute>
                    }
                  />

                  {/* Customer only */}
                  <Route
                    path="/my-products"
                    element={
                      <ProtectedRoute allowedRoles={["customer"]}>
                        <MyProducts />
                      </ProtectedRoute>
                    }
                  />

                  {/* Admin only */}
                  <Route
                    path="/analytics"
                    element={
                      <ProtectedRoute allowedRoles={["admin"]}>
                        <Analytics />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/audit-logs"
                    element={
                      <ProtectedRoute allowedRoles={["admin"]}>
                        <AuditLogs />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/users"
                    element={
                      <ProtectedRoute allowedRoles={["admin"]}>
                        <UsersPage />
                      </ProtectedRoute>
                    }
                  />

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </AnimatePresence>
          </ErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;