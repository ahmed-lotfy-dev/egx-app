/**
 * Base URL of the EGX API.
 *
 * Defaults to the production API. For local development against a locally
 * running API, set `VITE_API_BASE` in `apps/admin/.env.local`
 * (e.g. `VITE_API_BASE=http://localhost:3000`).
 */
export const OCI_API_BASE: string =
  import.meta.env.VITE_API_BASE?.trim() || "https://egx-api.alotfy.site";
