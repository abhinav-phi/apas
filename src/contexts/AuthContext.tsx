import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type AppRole = "manufacturer" | "supplier" | "customer" | "admin";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  profile: { full_name: string; company_name: string | null } | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string, role: AppRole, companyName?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Delay helper
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [profile, setProfile] = useState<{ full_name: string; company_name: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * Fetch user role & profile from DB.
   * Retries up to 5 times with back-off to handle the race condition where
   * the database trigger hasn't finished inserting the row yet.
   */
  const fetchUserData = useCallback(async (userId: string, retries = 5): Promise<void> => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const [roleRes, profileRes] = await Promise.all([
          supabase.from("user_roles").select("role").eq("user_id", userId).limit(1).maybeSingle(),
          supabase.from("profiles").select("full_name, company_name").eq("user_id", userId).maybeSingle(),
        ]);

        const fetchedRole = (roleRes.data?.role as AppRole) || null;
        const fetchedProfile = profileRes.data || null;

        // If we got a role, great — set it and return
        if (fetchedRole) {
          setRole(fetchedRole);
          setProfile(fetchedProfile);
          return;
        }

        // If no role found and we still have retries, wait and try again
        // (the trigger may not have fired yet)
        if (attempt < retries) {
          console.log(`[AuthContext] Role not found yet for ${userId}, retrying (${attempt + 1}/${retries})...`);
          await wait(500 * (attempt + 1)); // 500ms, 1s, 1.5s, 2s, 2.5s
          continue;
        }

        // All retries exhausted — try to create role from user metadata as fallback
        console.warn(`[AuthContext] Role still not found after ${retries} retries. Attempting client-side fallback...`);
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        const metaRole = currentUser?.user_metadata?.app_role as AppRole | undefined;
        
        if (metaRole) {
          // Try inserting the role ourselves (in case trigger didn't fire)
          const { error: insertError } = await supabase
            .from("user_roles")
            .insert({ user_id: userId, role: metaRole });
          
          if (!insertError) {
            setRole(metaRole);
          } else {
            // Insert may fail if row already exists — that's OK, just log
            console.warn("[AuthContext] Fallback role insert note:", insertError.message);
            setRole(null);
          }
        } else {
          setRole(null);
        }
        setProfile(fetchedProfile);

      } catch (err) {
        console.error("[AuthContext] fetchUserData error:", err);
        if (attempt === retries) {
          setRole(null);
          setProfile(null);
        }
      }
    }
  }, []);

  useEffect(() => {
    let initialized = false;

    // Get session once on mount
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchUserData(session.user.id);
      }
      initialized = true;
      setLoading(false);
    });

    // Listen for auth changes AFTER initial load
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!initialized) return; // skip — initial getSession handles it
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchUserData(session.user.id);
      } else {
        setRole(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchUserData]);

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    role: AppRole,
    companyName?: string
  ) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          app_role: role,          // ← trigger reads this
          company_name: companyName || null,
        },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) throw error;

    if (data.user) {
      // The database trigger (handle_new_user) will auto-create the role & profile.
      // But as a safety net, also try client-side insert (handles cases where
      // the trigger hasn't been set up yet, or RLS blocks the trigger).
      try {
        await supabase
          .from("user_roles")
          .insert({ user_id: data.user.id, role });
      } catch (e) {
        console.warn("[AuthContext] Client-side role insert note:", e);
      }

      try {
        await supabase
          .from("profiles")
          .insert(
            { user_id: data.user.id, full_name: fullName, company_name: companyName || null }
          );
      } catch (e) {
        console.warn("[AuthContext] Client-side profile insert note:", e);
      }
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, role, profile, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}