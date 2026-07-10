import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Tables } from "@/integrations/supabase/types";
import L from "leaflet";

// Fix leaflet icon issue in Vite
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

const DefaultIcon = L.icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

export function SupplyChainMap({ events }: { events: Tables<"supply_chain_events">[] }) {
  const mapEvents = events.filter(e => e.latitude !== null && e.longitude !== null);
  
  if (mapEvents.length === 0) {
    return (
      <div className="h-[400px] flex items-center justify-center bg-muted/20 rounded-xl border border-border border-dashed">
        <p className="text-muted-foreground text-sm">No location data available for these events.</p>
      </div>
    );
  }

  const positions: [number, number][] = mapEvents.map(e => [e.latitude!, e.longitude!]);
  const center = positions[0];

  return (
    <div className="h-[400px] w-full rounded-xl overflow-hidden border border-border">
      <MapContainer center={center} zoom={3} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          className="map-tiles"
        />
        {mapEvents.map((e) => (
          <Marker key={e.id} position={[e.latitude!, e.longitude!]}>
            <Popup>
              <div className="text-sm font-sans">
                <p className="font-semibold text-foreground">{e.event_type.replace(/_/g, " ").toUpperCase()}</p>
                <p className="text-muted-foreground mt-1">{e.location}</p>
                <p className="text-xs text-muted-foreground mt-1">{new Date(e.created_at).toLocaleString()}</p>
              </div>
            </Popup>
          </Marker>
        ))}
        {positions.length > 1 && (
          <Polyline positions={positions} color="#71ffe8" weight={3} opacity={0.7} dashArray="5, 10" />
        )}
      </MapContainer>
      <style>{`
        .map-tiles { filter: brightness(0.6) invert(1) contrast(3) hue-rotate(200deg) saturate(0.3) brightness(0.7); }
        .leaflet-popup-content-wrapper { background: #10141a; color: #dfe2eb; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); }
        .leaflet-popup-tip { background: #10141a; }
      `}</style>
    </div>
  );
}
