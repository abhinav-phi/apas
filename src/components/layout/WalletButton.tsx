// Connect Wallet button for the dashboard top bar (ImplementationPlan 4.1.3)
// States: no wallet → install CTA · connected+wrong chain → switch ·
// connected → address chip (click to disconnect).
import { Loader2, ExternalLink, Wallet } from "lucide-react";
import { useBlockchain } from "@/hooks/use-blockchain";
import { METAMASK_DOWNLOAD_URL, SEPOLIA_CHAIN_ID, shortAddress, toWalletError } from "@/lib/blockchain";
import { useToast } from "@/hooks/use-toast";

export function WalletButton() {
  const { installed, address, chainId, connecting, connect, disconnect, switchToSepolia } = useBlockchain();
  const { toast } = useToast();

  const handleConnect = async () => {
    try {
      await connect();
      toast({ title: "Wallet connected", description: "Sepolia anchoring is now available." });
    } catch (err) {
      const werr = toWalletError(err);
      toast({ title: "Wallet connection failed", description: werr.message, variant: "destructive" });
    }
  };

  const handleSwitch = async () => {
    try {
      await switchToSepolia();
      toast({ title: "Network switched", description: "Connected to Sepolia (chain 11155111)." });
    } catch (err) {
      toast({ title: "Could not switch network", description: toWalletError(err).message, variant: "destructive" });
    }
  };

  const chipStyle: React.CSSProperties = {
    color: "#849490",
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: "12px",
  };

  if (!installed) {
    return (
      <a
        href={METAMASK_DOWNLOAD_URL}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1.5 px-3 py-1.5 transition-colors hover:bg-muted/50 rounded-md"
        style={chipStyle}
        title="No Ethereum wallet detected — install MetaMask"
      >
        <Wallet className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Install Wallet</span>
        <ExternalLink className="w-3 h-3" />
      </a>
    );
  }

  if (connecting) {
    return (
      <span className="flex items-center gap-1.5 px-3 py-1.5" style={chipStyle}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Connecting…
      </span>
    );
  }

  if (!address) {
    return (
      <button
        onClick={handleConnect}
        className="flex items-center gap-1.5 px-3 py-1.5 transition-colors hover:bg-muted/50 rounded-md"
        style={chipStyle}
      >
        <Wallet className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Connect Wallet</span>
      </button>
    );
  }

  if (chainId !== null && chainId !== SEPOLIA_CHAIN_ID) {
    return (
      <button
        onClick={handleSwitch}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors"
        style={{ ...chipStyle, color: "#f9bc48", background: "rgba(249,188,72,0.08)" }}
        title={`Wallet is on chain ${chainId} — click to switch to Sepolia`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[#f9bc48] animate-pulse" />
        <span className="hidden sm:inline">Switch to Sepolia</span>
      </button>
    );
  }

  return (
    <button
      onClick={disconnect}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors hover:bg-muted/50"
      style={chipStyle}
      title={`${address} — click to disconnect`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-[#71ffe8]" />
      {shortAddress(address)}
    </button>
  );
}
