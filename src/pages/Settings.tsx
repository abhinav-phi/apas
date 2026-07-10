import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { User, Lock, Save, Shield } from "lucide-react";

export default function Settings() {
  const { user, profile, role, refreshProfile } = useAuth();
  const { toast } = useToast();

  const [profileForm, setProfileForm] = useState({ full_name: "", company_name: "" });
  const [passwordForm, setPasswordForm] = useState({ current: "", new: "", confirm: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Settings — AuthentiChain";
    if (profile) {
      setProfileForm({
        full_name: profile.full_name || "",
        company_name: profile.company_name || "",
      });
      setLoading(false);
    }
  }, [profile]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: profileForm.full_name.trim(),
        company_name: profileForm.company_name.trim() || null,
      })
      .eq("user_id", user.id);

    if (error) {
      toast({ title: "Error saving profile", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Profile updated", description: "Your profile has been saved." });
      await refreshProfile();
    }
    setSavingProfile(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.new !== passwordForm.confirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (passwordForm.new.length < 8) {
      toast({ title: "Password too short", description: "Minimum 8 characters.", variant: "destructive" });
      return;
    }

    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: passwordForm.new });

    if (error) {
      toast({ title: "Error changing password", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Password updated", description: "Your password has been changed." });
      setPasswordForm({ current: "", new: "", confirm: "" });
    }
    setSavingPassword(false);
  };

  const sectionCard = (
    title: string,
    subtitle: string,
    icon: React.ReactNode,
    children: React.ReactNode
  ) => (
    <div className="bg-card rounded-xl border border-border shadow-card">
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(113,255,232,0.1)", color: "#71ffe8" }}>
            {icon}
          </div>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: "#dfe2eb" }}>{title}</h2>
            <p className="text-xs" style={{ color: "#849490", fontFamily: "IBM Plex Mono, monospace" }}>{subtitle}</p>
          </div>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="max-w-2xl space-y-8">
        {/* Header */}
        <div>
          <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "#71ffe8", fontFamily: "IBM Plex Mono, monospace" }}>
            Settings
          </p>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: "#dfe2eb" }}>
            Account Settings
          </h1>
          <p className="text-sm mt-1" style={{ color: "#849490" }}>
            Manage your profile, security, and preferences.
          </p>
        </div>

        {/* Account Info (read-only) */}
        {sectionCard("Account Info", "Read-only account details", <Shield className="w-4 h-4" />,
          <div className="space-y-3">
            <div>
              <p className="text-xs mb-1" style={{ color: "#849490", fontFamily: "IBM Plex Mono, monospace" }}>Email</p>
              <p className="text-sm" style={{ color: "#dfe2eb" }}>{user?.email || "—"}</p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: "#849490", fontFamily: "IBM Plex Mono, monospace" }}>Role</p>
              <span
                className="inline-block text-xs px-2.5 py-1 rounded-full uppercase tracking-wider font-mono font-bold"
                style={{ background: "rgba(113,255,232,0.1)", color: "#71ffe8" }}
              >
                {role || "—"}
              </span>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: "#849490", fontFamily: "IBM Plex Mono, monospace" }}>Member Since</p>
              <p className="text-sm" style={{ color: "#dfe2eb" }}>
                {user?.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}
              </p>
            </div>
          </div>
        )}

        {/* Profile */}
        {sectionCard("Profile", "Update your display name and company", <User className="w-4 h-4" />,
          loading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-24" />
            </div>
          ) : (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <Label htmlFor="full_name" className="text-xs mb-1.5" style={{ color: "#849490" }}>
                  Full Name *
                </Label>
                <Input
                  id="full_name"
                  value={profileForm.full_name}
                  onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
                  required
                  minLength={1}
                  placeholder="Your full name"
                />
              </div>
              <div>
                <Label htmlFor="company_name" className="text-xs mb-1.5" style={{ color: "#849490" }}>
                  Company Name
                </Label>
                <Input
                  id="company_name"
                  value={profileForm.company_name}
                  onChange={(e) => setProfileForm({ ...profileForm, company_name: e.target.value })}
                  placeholder="Your company (optional)"
                />
              </div>
              <Button type="submit" size="sm" disabled={savingProfile}>
                <Save className="w-4 h-4 mr-1" />
                {savingProfile ? "Saving..." : "Save Profile"}
              </Button>
            </form>
          )
        )}

        {/* Password */}
        {sectionCard("Security", "Change your account password", <Lock className="w-4 h-4" />,
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <Label htmlFor="new_password" className="text-xs mb-1.5" style={{ color: "#849490" }}>
                New Password *
              </Label>
              <Input
                id="new_password"
                type="password"
                value={passwordForm.new}
                onChange={(e) => setPasswordForm({ ...passwordForm, new: e.target.value })}
                required
                minLength={8}
                placeholder="Minimum 8 characters"
              />
            </div>
            <div>
              <Label htmlFor="confirm_password" className="text-xs mb-1.5" style={{ color: "#849490" }}>
                Confirm New Password *
              </Label>
              <Input
                id="confirm_password"
                type="password"
                value={passwordForm.confirm}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                required
                minLength={8}
                placeholder="Repeat new password"
              />
              {passwordForm.new && passwordForm.confirm && passwordForm.new !== passwordForm.confirm && (
                <p className="text-xs mt-1" style={{ color: "#ffb4ab" }}>Passwords do not match</p>
              )}
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={savingPassword || !passwordForm.new || !passwordForm.confirm || passwordForm.new !== passwordForm.confirm}
            >
              <Lock className="w-4 h-4 mr-1" />
              {savingPassword ? "Updating..." : "Change Password"}
            </Button>
          </form>
        )}
      </div>
    </DashboardLayout>
  );
}
