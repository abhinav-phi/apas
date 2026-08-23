import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "manufacturer" | "supplier" | "customer" | "admin";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  profile: { full_name: string; company_name: string | null; avatar_url: string | null } | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string, role: AppRole, companyName?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Delay helper
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isDev = import.meta.env.DEV;
const log = (...args: unknown[]) => { if (isDev) console.log("[AuthContext]", ...args); };
const warn = (...args: unknown[]) => { if (isDev) console.warn("[AuthContext]", ...args); };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [profile, setProfile] = useState<{ full_name: string; company_name: string | null; avatar_url: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * Fetch user role & profile from DB.
   * Retries up to 5 times with back-off to handle the race condition where
   * the database trigger hasn't finished inserting the row yet.
   * 
   * NOTE: The client-side role INSERT fallback has been REMOVED for security.
   * Roles must only be assigned by the server-side handle_new_user() trigger.
   */
  const fetchUserData = useCallback(async (userId: string, retries = 5): Promise<void> => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const [roleRes, profileRes] = await Promise.all([
          supabase.from("user_roles").select("role").eq("user_id", userId).limit(1).maybeSingle(),
          supabase.from("profiles").select("full_name, company_name, avatar_url").eq("user_id", userId).maybeSingle(),
        ]);

        const fetchedRole = (roleRes.data?.role as AppRole) || null;
        const fetchedProfile = profileRes.data || null;

        if (fetchedRole) {
          setRole(fetchedRole);
          setProfile(fetchedProfile);
          return;
        }

        if (attempt < retries) {
          log(`Role not found yet for ${userId}, retrying (${attempt + 1}/${retries})...`);
          await wait(500 * (attempt + 1)); // 500ms, 1s, 1.5s, 2s, 2.5s
          continue;
        }

        // All retries exhausted — role will remain null (broken state)
        warn(`Role still not found after ${retries} retries for user ${userId}. Trigger may not have fired.`);
        setRole(null);
        setProfile(fetchedProfile);

      } catch (err: unknown) {
        if (isDev) console.error("[AuthContext] fetchUserData error:", err);
        if (attempt === retries) {
          setRole(null);
          setProfile(null);
        }
      }
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (currentUser) {
      await fetchUserData(currentUser.id);
    }
  }, [fetchUserData]);

  useEffect(() => {
    let initialized = false;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchUserData(session.user.id);
      }
      initialized = true;
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!initialized) return;

      setLoading(true);
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
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          app_role: role, // trigger reads this to assign role
          company_name: companyName || null,
        },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) throw error;
    // NOTE: We do NOT insert into user_roles from client-side.
    // The handle_new_user() trigger (SECURITY DEFINER) does it server-side.
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
    <AuthContext.Provider value={{ user, session, role, profile, loading, signUp, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}