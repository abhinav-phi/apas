/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_APP_NAME?: string;
  readonly VITE_APP_URL?: string;
  readonly VITE_SEPOLIA_RPC_URL?: string;
  readonly VITE_SEPOLIA_RPC_FALLBACK_1?: string;
  readonly VITE_SEPOLIA_RPC_FALLBACK_2?: string;
  readonly VITE_CONTRACT_ADDRESS?: string;
  readonly VITE_CHAIN_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
