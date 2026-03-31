import { Link } from "react-router-dom";
import { Shield } from "lucide-react";

export function AppFooter({ variant = "default" }: { variant?: "default" | "dark" }) {
  const isDark = variant === "dark";

  return (
    <footer className={`border-t py-8 mt-auto z-10 block shrink-0 transition-colors ${
      isDark 
        ? "border-white/10 bg-black/50 backdrop-blur-xl" 
        : "border-border bg-card/80 backdrop-blur-xl"
    }`}>
      <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
             <Shield className="w-3 h-3 text-primary-foreground" />
          </div>
          <span className={`text-sm font-semibold ${isDark ? "text-white" : ""}`}>AuthentiChain</span>
        </div>
        
        <div className={`flex items-center gap-6 text-sm ${isDark ? "text-white/60" : "text-muted-foreground"}`}>
           <Link to="/" className={`transition-colors ${isDark ? "hover:text-white" : "hover:text-foreground"}`}>Home</Link>
           <Link to="/verify" className={`transition-colors ${isDark ? "hover:text-white" : "hover:text-foreground"}`}>Verify</Link>
           <Link to="/system-design" className={`transition-colors ${isDark ? "hover:text-white" : "hover:text-foreground"}`}>System Design</Link>
        </div>

        <p className={`text-xs ${isDark ? "text-white/40" : "text-muted-foreground"}`}>© {new Date().getFullYear()} AuthentiChain. All rights reserved.</p>
      </div>
    </footer>
  );
}
