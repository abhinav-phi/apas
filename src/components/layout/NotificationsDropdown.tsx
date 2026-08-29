import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Bell, Info, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Tables } from "@/integrations/supabase/types";

type NotificationRow = Tables<"notifications">;

export function NotificationsDropdown() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;

    // Initial fetch
    const fetchNotifications = async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) {
        toast({ title: "Could not load notifications", description: error.message, variant: "destructive" });
        return;
      }

      if (data) {
        setNotifications(data as NotificationRow[]);
        setUnreadCount(data.filter(n => !n.is_read).length);
      }
    };
    fetchNotifications();

    // Subscribe to realtime notifications
    const channel = supabase.channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const newNotif = payload.new as NotificationRow;
          setNotifications(prev => [newNotif, ...prev].slice(0, 20));
          setUnreadCount(prev => prev + 1);
          toast({
            title: newNotif.title,
            description: newNotif.message,
            variant: newNotif.type === 'alert' ? 'destructive' : 'default',
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, toast]);

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && unreadCount > 0 && userId) {
      // Mark all as read locally instantly, then persist. R10: no
      // fire-and-forget — on failure the optimistic state is reverted so the
      // UI can't claim "read" while the DB still says unread.
      const previouslyUnread = notifications.filter((n) => !n.is_read);
      const failedIds = new Set(previouslyUnread.map((n) => n.id));
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));

      void (async () => {
        const { error } = await supabase
          .from("notifications")
          .update({ is_read: true })
          .eq("user_id", userId)
          .eq("is_read", false);
        if (error) {
          setNotifications((prev) =>
            prev.map((n) => (failedIds.has(n.id) ? { ...n, is_read: false } : n))
          );
          setUnreadCount(previouslyUnread.length);
          toast({
            title: "Could not mark notifications as read",
            description: error.message,
            variant: "destructive",
          });
        }
      })();
    }
  };

  const IconForType = ({ type }: { type: string }) => {
    switch (type) {
      case 'alert': return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'success': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      default: return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          className="relative p-2 transition-colors rounded-full hover:bg-muted/30 focus:outline-none"
          style={{ color: unreadCount > 0 ? '#dfe2eb' : '#849490' }}
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-[#10141a]" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[80vh] overflow-y-auto p-0" style={{ background: "#161B22", borderColor: "rgba(113,255,232,0.1)" }}>
        <div className="p-3 border-b border-border flex items-center justify-between sticky top-0 bg-[#161B22] z-10">
          <h3 className="font-semibold text-sm" style={{ color: "#dfe2eb" }}>Notifications</h3>
          {notifications.length > 0 && (
            <button
              onClick={() => {
                if (!userId) return;
                setNotifications([]);
                supabase.from("notifications").delete().eq("user_id", userId).then();
              }}
              className="text-xs hover:underline"
              style={{ color: "#849490" }}
            >
              Clear all
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: "#7d8d88" }}>
            No new notifications
          </div>
        ) : (
          <div className="divide-y divide-border">
            {notifications.map((n) => (
              <DropdownMenuItem key={n.id} asChild className="p-0">
                <Link
                  to={n.link_url || "#"}
                  className="flex items-start gap-3 p-3 hover:bg-muted/20 transition-colors cursor-pointer w-full focus:bg-muted/20"
                  style={{ background: n.is_read ? 'transparent' : 'rgba(113,255,232,0.03)' }}
                >
                  <div className="shrink-0 mt-0.5"><IconForType type={n.type} /></div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-sm font-medium leading-tight" style={{ color: "#dfe2eb" }}>{n.title}</p>
                    <p className="text-xs leading-snug" style={{ color: "#849490" }}>{n.message}</p>
                    <p className="text-[10px]" style={{ color: "#7d8d88", fontFamily: "IBM Plex Mono, monospace" }}>
                      {new Date(n.created_at).toLocaleString()}
                    </p>
                  </div>
                </Link>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
