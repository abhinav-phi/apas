import { Link } from "react-router-dom";
import { FlowButton } from "@/components/ui/flow-button";

export function AppFooter({ variant = "default" }: { variant?: "default" | "dark" }) {
  return (
    <footer
      className="py-6 mt-auto shrink-0"
      style={{
        background: '#10141a',
        borderTop: '1px solid rgba(113,255,232,0.08)',
      }}
    >
      <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <img src="/apas.png" alt="AuthentiChain Logo" className="w-6 h-6 object-contain rounded-sm" />
          <span className="font-headline font-bold text-sm" style={{ color: '#00e5cc' }}>
            AuthentiChain
          </span>
        </div>

        <div className="flex items-center gap-6">
          {[
            { to: "/", label: "Home" },
            { to: "/verify", label: "Verify" },
            { to: "/system-design", label: "System Design" },
          ].map(link => (
            <FlowButton
              key={link.to}
              to={link.to}
              text={link.label}
              size="sm"
              hideArrow={true}
              className="opacity-80 hover:opacity-100"
            />
          ))}
        </div>

        <p style={{ color: '#849490', fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.6rem', letterSpacing: '0.08em' }}>
          © {new Date().getFullYear()} AuthentiChain
        </p>
      </div>
    </footer>
  );
}