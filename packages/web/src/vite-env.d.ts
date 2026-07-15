/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute origin of the API service in production; unset in dev. */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
