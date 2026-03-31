import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppFooter } from "@/components/layout/AppFooter";
import { Button } from "@/components/ui/button";
import { Home, AlertCircle } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-5xl font-extrabold text-foreground">404</h1>
          <p className="text-lg text-muted-foreground">Oops! That page doesn't exist.</p>
          <p className="text-sm text-muted-foreground/60 font-mono">{location.pathname}</p>
          <Link to="/">
            <Button variant="outline" size="lg" className="mt-4 gap-2">
              <Home className="w-4 h-4" />
              Return to Home
            </Button>
          </Link>
        </div>
      </div>
      <AppFooter />
    </div>
  );
};

export default NotFound;
