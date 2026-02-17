/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RELAY_API_KEY: string;
  readonly VITE_PIMLICO_RPC_URL: string;
  readonly VITE_EOA_PRIVATE_KEY: string;
  readonly VITE_WALLETCONNECT_PROJECT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
