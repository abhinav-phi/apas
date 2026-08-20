import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useDebounce } from "@/hooks/use-debounce";
import { Users, RefreshCw, Search, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 25;

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
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [roleFilter, setRoleFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    let query = supabase.from("profiles").select("*, user_roles(role)", { count: "exact" }).order("created_at", { ascending: false });

    if (roleFilter !== "all") {
      query = query.filter("user_roles.role", "eq", roleFilter);
    }

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, count, error } = await query.range(from, to);

    if (error) {
      toast({ title: "Error loading users", description: error.message, variant: "destructive" });
      setUsers([]);
    } else if (data) {
      const mapped = data.map((u) => ({
        id: u.id,
        user_id: u.user_id,
        full_name: u.full_name || "Unknown",
        company_name: u.company_name || null,
        created_at: u.created_at,
        role: String((u.user_roles as unknown as Array<{ role: string }> | null)?.[0]?.role ?? "customer"),
      }));

      const q = debouncedSearch.trim().toLowerCase();
      setUsers(
        q
          ? mapped.filter(
              (u) =>
                u.full_name.toLowerCase().includes(q) ||
                (u.company_name ?? "").toLowerCase().includes(q) ||
                u.user_id.toLowerCase().includes(q)
            )
          : mapped
      );
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }, [page, roleFilter, debouncedSearch, toast]);

  useEffect(() => {
    document.title = "Users — AuthentiChain";
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, roleFilter]);

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
      const result = data as unknown as { success?: boolean; error?: string };
      if (result.success !== false) {
        toast({ title: "Role updated", description: `User role changed to ${newRole}` });
        fetchUsers();
      } else {
        toast({ title: "Role change failed", description: result?.error, variant: "destructive" });
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

        {/* Search + filter row */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#5a6a66" }} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, company or user id..."
              className="pl-9"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[160px] h-10">
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="manufacturer">Manufacturer</SelectItem>
              <SelectItem value="supplier">Supplier</SelectItem>
              <SelectItem value="customer">Customer</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs" style={{ color: "#5a6a66", fontFamily: "IBM Plex Mono, monospace" }}>
            {totalCount} user{totalCount === 1 ? "" : "s"}
          </span>
        </div>

        <div className="rounded-xl border overflow-hidden" style={{ background: "#161B22", borderColor: "rgba(113,255,232,0.1)" }}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b" style={{ background: "#0a0e14", borderColor: "rgba(113,255,232,0.1)" }}>
                  {["User", "Company", "Role", "Joined", "Actions"].map((h) => (
                    <th key={h} className="text-left text-xs font-medium px-4 py-3" style={{ color: "#849490", fontFamily: "IBM Plex Mono, monospace" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "rgba(113,255,232,0.06)" }}>
                {loading
                  ? Array.from({ length: Math.min(8, PAGE_SIZE) }).map((_, i) => (
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
                      <p className="text-xs mt-1" style={{ color: "#5a6a66" }}>
                        {debouncedSearch || roleFilter !== "all"
                          ? "Try adjusting your search or role filter."
                          : "Users appear here after they sign up."}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: "rgba(113,255,232,0.06)" }}>
              <span className="text-xs" style={{ color: "#5a6a66", fontFamily: "IBM Plex Mono, monospace" }}>
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                {Array.from({ length: totalPages }).slice(0, 10).map((_, i) => (
                  <Button
                    key={i}
                    variant={page === i + 1 ? "default" : "outline"}
                    size="sm"
                    className="w-8"
                    onClick={() => setPage(i + 1)}
                  >
                    {i + 1}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}