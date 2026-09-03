/**
 * Vite exposes only `VITE_`-prefixed env vars to client code
 * (import.meta.env) — see https://vite.dev/guide/env-and-mode. No secrets
 * belong here; this is a browser bundle.
 */
export const apiBaseUrl: string = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:4000";
