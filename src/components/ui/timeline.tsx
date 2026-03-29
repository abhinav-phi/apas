import { cn } from "@/lib/utils";
import { Package, Truck, MapPin, ShoppingCart, AlertTriangle, CheckCircle2 } from "lucide-react";

interface TimelineEvent {
  id: string;
  event_type: string;
  location?: string | null;
  notes?: string | null;
  created_at: string;
  actor_name?: string;
  event_hash: string;
}

const eventIcons: Record<string, typeof Package> = {
  manufactured: Package,
  shipped: Truck,
  in_transit: Truck,
  received: MapPin,
  delivered: CheckCircle2,
  sold: ShoppingCart,
  recalled: AlertTriangle,
  expired: AlertTriangle,
};

const eventColors: Record<string, string> = {
  manufactured: "bg-primary text-primary-foreground",
  shipped: "bg-primary/80 text-primary-foreground",
  in_transit: "bg-warning text-warning-foreground",
  received: "bg-success/80 text-success-foreground",
  delivered: "bg-success text-success-foreground",
  sold: "bg-accent text-accent-foreground",
  recalled: "bg-destructive text-destructive-foreground",
  expired: "bg-muted text-muted-foreground",
};

export function SupplyChainTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="relative space-y-0">
      {events.map((event, i) => {
        const Icon = eventIcons[event.event_type] || Package;
        return (
          <div key={event.id} className="flex gap-4 pb-6 last:pb-0">
            {/* Line + Dot */}
            <div className="flex flex-col items-center">
              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center z-10 shrink-0", eventColors[event.event_type] || "bg-muted text-muted-foreground")}>
                <Icon className="w-4 h-4" />
              </div>
              {i < events.length - 1 && <div className="w-0.5 flex-1 bg-border mt-1" />}
            </div>
            {/* Content */}
            <div className="pb-2 pt-0.5 flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <p className="text-sm font-semibold text-foreground capitalize">{event.event_type.replace(/_/g, " ")}</p>
                <span className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString()}</span>
              </div>
              {event.location && <p className="text-xs text-muted-foreground mt-0.5">📍 {event.location}</p>}
              {event.notes && <p className="text-xs text-muted-foreground mt-0.5">{event.notes}</p>}
              <p className="text-xs font-mono text-muted-foreground/50 mt-1 truncate">Hash: {event.event_hash.substring(0, 24)}...</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
