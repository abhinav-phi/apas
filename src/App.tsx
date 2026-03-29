import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AnimatePresence } from "framer-motion";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Batches from "./pages/Batches";
import QRCodes from "./pages/QRCodes";
import SupplyChain from "./pages/SupplyChain";
import ScanUpdate from "./pages/ScanUpdate";
import Verify from "./pages/Verify";
import Alerts from "./pages/Alerts";
import Analytics from "./pages/Analytics";
import AuditLogs from "./pages/AuditLogs";
import UsersPage from "./pages/Users";
import MyProducts from "./pages/MyProducts";
import SystemDesign from "./pages/SystemDesign";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { user, role, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (allowedRoles && role && !allowedRoles.includes(role)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;
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
          <AnimatePresence mode="wait">
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<PublicOnlyRoute><Auth /></PublicOnlyRoute>} />
              <Route path="/verify" element={<Verify />} />
              <Route path="/system-design" element={<SystemDesign />} />

              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/products" element={<ProtectedRoute allowedRoles={["manufacturer", "admin"]}><Products /></ProtectedRoute>} />
              <Route path="/batches" element={<ProtectedRoute allowedRoles={["manufacturer"]}><Batches /></ProtectedRoute>} />
              <Route path="/qr-codes" element={<ProtectedRoute allowedRoles={["manufacturer"]}><QRCodes /></ProtectedRoute>} />
              <Route path="/supply-chain" element={<ProtectedRoute allowedRoles={["manufacturer", "supplier"]}><SupplyChain /></ProtectedRoute>} />
              <Route path="/scan-update" element={<ProtectedRoute allowedRoles={["supplier"]}><ScanUpdate /></ProtectedRoute>} />
              <Route path="/my-products" element={<ProtectedRoute allowedRoles={["customer"]}><MyProducts /></ProtectedRoute>} />
              <Route path="/alerts" element={<ProtectedRoute allowedRoles={["manufacturer", "admin"]}><Alerts /></ProtectedRoute>} />
              <Route path="/analytics" element={<ProtectedRoute allowedRoles={["admin"]}><Analytics /></ProtectedRoute>} />
              <Route path="/audit-logs" element={<ProtectedRoute allowedRoles={["admin"]}><AuditLogs /></ProtectedRoute>} />
              <Route path="/users" element={<ProtectedRoute allowedRoles={["admin"]}><UsersPage /></ProtectedRoute>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </AnimatePresence>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
