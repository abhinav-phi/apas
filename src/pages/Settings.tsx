import { useEffect, useState, useRef } from "react";
import { verifyMessage } from "viem";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useBlockchain } from "@/hooks/use-blockchain";
import { SEPOLIA_CHAIN_ID, shortAddress, toWalletError } from "@/lib/blockchain";
import { resizeImage, MAX_UPLOAD_BYTES } from "@/lib/image";
import { User, Lock, Save, Shield, Wallet, Unlink, BadgeCheck, Loader2, Upload, X } from "lucide-react";

interface WalletRow {
  id: string;
  wallet_address: string;
  chain_id: number;
  verified: boolean;
  verified_at: string | null;
}

export default function Settings() {
  const { user, profile, role, refreshProfile } = useAuth();
  const { toast } = useToast();
  const { connect, address } = useBlockchain();

  const [profileForm, setProfileForm] = useState({ full_name: "", company_name: "" });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile?.avatar_url || null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [passwordForm, setPasswordForm] = useState({ current: "", new: "", confirm: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [loading, setLoading] = useState(true);

  const [walletRow, setWalletRow] = useState<WalletRow | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [walletBusy, setWalletBusy] = useState(false);

  const fetchWallet = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("wallet_addresses")
      .select("id, wallet_address, chain_id, verified, verified_at")
      .maybeSingle();
    if (error && error.code !== "PGRST116") {
      toast({ title: "Could not load wallet", description: error.message, variant: "destructive" });
    }
    setWalletRow((data as WalletRow | null) ?? null);
    setWalletLoading(false);
  };

  useEffect(() => {
    document.title = "Settings — AuthentiChain";
    fetchWallet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (profile) {
      setProfileForm({
        full_name: profile.full_name || "",
        company_name: profile.company_name || "",
      });
      setAvatarPreview(profile.avatar_url || null);
      setLoading(false);
    }
  }, [profile]);

  // Avatar upload to Supabase Storage (reuses the product-images bucket with an avatars/ prefix)
  const handleAvatarFile = async (file: File) => {
    if (!user) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file type", description: "Please choose an image file", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 5MB allowed", variant: "destructive" });
      return;
    }

    setUploadingAvatar(true);
    try {
      // R26: compress on-device so storage never holds >1MB avatars
      const blob = await resizeImage(file, { maxDim: 512 });
      if (blob.size > MAX_UPLOAD_BYTES) {
        throw new Error("Image could not be compressed under 1MB — try a smaller image");
      }
      const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
      const path = `avatars/${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(path, blob, { upsert: true, contentType: blob.type });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from("product-images").getPublicUrl(path);

      const { error: dbError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("user_id", user.id);
      if (dbError) throw dbError;

      setAvatarPreview(publicUrl);
      await refreshProfile();
      toast({ title: "Avatar updated" });
    } catch (err: unknown) {
      setAvatarPreview(profile?.avatar_url || null);
      toast({ title: "Avatar upload failed", description: (err as Error).message, variant: "destructive" });
    }
    setUploadingAvatar(false);
  };

  const handleRemoveAvatar = async () => {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("user_id", user.id);
    if (error) {
      toast({ title: "Could not remove avatar", description: error.message, variant: "destructive" });
      return;
    }
    setAvatarPreview(null);
    await refreshProfile();
    toast({ title: "Avatar removed" });
  };

  // Wallet linking: server nonce → wallet signature → verified link (TechSpec §6.3)
  const handleLinkWallet = async () => {
    setWalletBusy(true);
    try {
      const walletAddress = address ?? (await connect());
      if (!walletAddress) throw new Error("Wallet connection cancelled");

      const { data: nonce, error: nonceError } = await supabase.rpc("request_wallet_nonce", {
        p_wallet_address: walletAddress,
      });
      if (nonceError || !nonce) throw new Error(nonceError?.message ?? "Could not request nonce");

      const message = `AuthentiChain wallet verification\nNonce: ${nonce}`;
      const { getWalletClient } = await import("@/lib/blockchain");
      const walletClient = getWalletClient();
      const signature = await walletClient.signMessage({
        account: walletAddress as `0x${string}`,
        message,
      });

      // Signature check (viem): proves the caller controls the private key
      const valid = await verifyMessage({ address: walletAddress as `0x${string}`, message, signature });
      if (!valid) throw new Error("Signature did not verify against the wallet address");

      // Prefer server-side verification (audit MEDIUM #7): the edge function
      // recovers the signer from the signature itself, so a verified mapping can
      // only be created by whoever holds the key — the bare RPC never checked the
      // signature. Falls back to the RPC while the function isn't deployed.
      const { error: fnError } = await supabase.functions.invoke("verify-wallet-link", {
        body: { walletAddress, nonce, signature, chainId: SEPOLIA_CHAIN_ID },
      });
      if (fnError) {
        const { error: linkError } = await supabase.rpc("link_wallet_address", {
          p_wallet_address: walletAddress,
          p_nonce: nonce,
          p_signature: signature,
          p_chain_id: SEPOLIA_CHAIN_ID,
        });
        if (linkError) throw new Error(linkError.message);
      }

      toast({ title: "Wallet linked", description: `${shortAddress(walletAddress)} is now verified for on-chain actions.` });
      await fetchWallet();
    } catch (err: unknown) {
      const werr = toWalletError(err);
      toast({ title: "Wallet linking failed", description: werr.message, variant: "destructive" });
    } finally {
      setWalletBusy(false);
    }
  };

  const handleUnlinkWallet = async () => {
    setWalletBusy(true);
    const { error } = await supabase.rpc("unlink_wallet_address");
    if (error) {
      toast({ title: "Could not unlink wallet", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Wallet unlinked", description: "On-chain anchoring is disabled for this account." });
      await fetchWallet();
    }
    setWalletBusy(false);
  };

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
              <div className="flex items-center gap-4">
                <div className="relative w-14 h-14 rounded-full overflow-hidden shrink-0" style={{ background: "rgba(113,255,232,0.1)", border: "1px solid rgba(113,255,232,0.2)" }}>
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm font-bold" style={{ color: "#71ffe8", fontFamily: "IBM Plex Mono, monospace" }}>
                      {profileForm.full_name?.charAt(0)?.toUpperCase() || "U"}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatarFile(f); }}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => avatarInputRef.current?.click()} disabled={uploadingAvatar} className="gap-1.5 text-xs">
                    {uploadingAvatar ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                    {uploadingAvatar ? "Uploading..." : "Upload Avatar"}
                  </Button>
                  {avatarPreview && (
                    <Button type="button" variant="ghost" size="sm" onClick={handleRemoveAvatar} disabled={uploadingAvatar} className="gap-1.5 text-xs">
                      <X className="w-3 h-3" /> Remove
                    </Button>
                  )}
                </div>
              </div>
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

        {/* Blockchain wallet (TechSpec §6.3 — wallet ↔ account mapping) */}
        {sectionCard("Blockchain Wallet", "Link a wallet for Sepolia anchoring", <Wallet className="w-4 h-4" />,
          walletLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-32" />
            </div>
          ) : walletRow ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
                <BadgeCheck className="w-5 h-5 shrink-0" style={{ color: "#71ffe8" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono truncate" style={{ color: "#dfe2eb" }}>
                    {walletRow.wallet_address}
                  </p>
                  <p className="text-xs" style={{ color: "#849490" }}>
                    Verified {walletRow.verified_at ? new Date(walletRow.verified_at).toLocaleString() : "—"} · chain {walletRow.chain_id}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleUnlinkWallet} disabled={walletBusy} className="gap-1.5">
                {walletBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink className="w-4 h-4" />}
                Unlink Wallet
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs" style={{ color: "#849490" }}>
                Link your wallet by signing a one-time nonce challenge. Contract actions are gated on this
                verified mapping — the nonce is single-use and expires in 10 minutes.
              </p>
              <Button size="sm" onClick={handleLinkWallet} disabled={walletBusy} className="gap-1.5">
                {walletBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
                {walletBusy ? "Check your wallet…" : "Link Wallet"}
              </Button>
            </div>
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
