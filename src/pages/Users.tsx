import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Users, RefreshCw } from "lucide-react";

const ROLE_COLORS: Record<string, string> = {
  manufacturer: "text-blue-400 bg-blue-400/10",
  supplier: "text-amber-400 bg-amber-400/10",
  customer: "text-teal-400 bg-teal-400/10",
  admin: "text-red-400 bg-red-400/10",
};

interface UserRow {
  id: string;
  user_id: string;
  full_name: string;
  company_name: string | null;
  created_at: string;
  role: string;
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("*, user_roles(role)")
      .order("created_at", { ascending: false });

    if (data) {
      setUsers(
        data.map((u) => ({
          id: u.id,
          user_id: u.user_id,
          full_name: u.full_name || "Unknown",
          company_name: u.company_name || null,
          created_at: u.created_at,
          role: u.user_roles?.[0]?.role || "customer",
        }))
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    document.title = "Users — AuthentiChain";
    fetchUsers();
  }, [fetchUsers]);

  const handleRoleChange = async (targetUserId: string, newRole: string) => {
    if (targetUserId === currentUser?.id) {
      toast({ title: "Cannot change your own role", variant: "destructive" });
      return;
    }

    setUpdatingId(targetUserId);
    const { data, error } = await supabase.rpc("admin_change_role", {
      p_target_user_id: targetUserId,
      p_new_role: newRole,
    });

    if (error) {
      toast({ title: "Error changing role", description: error.message, variant: "destructive" });
    } else {
      const result = data as { success: boolean; error?: string };
      if (result.success) {
        toast({ title: "Role updated", description: `User role changed to ${newRole}` });
        fetchUsers();
      } else {
        toast({ title: "Role change failed", description: result.error, variant: "destructive" });
      }
    }
    setUpdatingId(null);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "#71ffe8", fontFamily: "IBM Plex Mono, monospace" }}>
              Admin
            </p>
            <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: "#dfe2eb" }}>Users</h1>
            <p className="text-sm mt-1" style={{ color: "#849490" }}>
              Manage system users and role assignments
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchUsers}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        </div>

        <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border" style={{ background: "#0a0e14" }}>
                  {["User", "Company", "Role", "Joined", "Actions"].map((h) => (
                    <th key={h} className="text-left text-xs font-medium px-4 py-3" style={{ color: "#849490", fontFamily: "IBM Plex Mono, monospace" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        <td className="px-4 py-3"><Skeleton className="h-8 w-40" /></td>
                        <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                        <td className="px-4 py-3"><Skeleton className="h-6 w-20" /></td>
                        <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                        <td className="px-4 py-3"><Skeleton className="h-8 w-32" /></td>
                      </tr>
                    ))
                  : users.map((u) => {
                      const isCurrentUser = u.user_id === currentUser?.id;
                      return (
                        <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div
                                className="w-8 h-8 flex items-center justify-center text-xs font-bold shrink-0"
                                style={{ background: "rgba(113,255,232,0.1)", color: "#71ffe8", fontFamily: "IBM Plex Mono, monospace" }}
                              >
                                {u.full_name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-medium" style={{ color: "#dfe2eb" }}>
                                  {u.full_name}
                                  {isCurrentUser && (
                                    <span className="ml-1.5 text-xs" style={{ color: "#849490" }}>(you)</span>
                                  )}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm" style={{ color: "#849490" }}>
                            {u.company_name || "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ROLE_COLORS[u.role] || ""}`}>
                              {u.role}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs" style={{ color: "#849490", fontFamily: "IBM Plex Mono, monospace" }}>
                            {new Date(u.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            {isCurrentUser ? (
                              <span className="text-xs" style={{ color: "#5a6a66" }}>—</span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Select
                                  value={u.role}
                                  onValueChange={(v) => handleRoleChange(u.user_id, v)}
                                  disabled={updatingId === u.user_id}
                                >
                                  <SelectTrigger className="h-7 text-xs w-[130px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="manufacturer">Manufacturer</SelectItem>
                                    <SelectItem value="supplier">Supplier</SelectItem>
                                    <SelectItem value="customer">Customer</SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                  </SelectContent>
                                </Select>
                                {updatingId === u.user_id && (
                                  <span className="text-xs" style={{ color: "#849490" }}>saving...</span>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                {!loading && users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-12">
                      <Users className="w-10 h-10 mx-auto mb-2" style={{ color: "rgba(132,148,144,0.4)" }} />
                      <p className="text-sm" style={{ color: "#849490" }}>No users found</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
