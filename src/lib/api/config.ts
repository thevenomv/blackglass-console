import type { Role } from "@/lib/auth/permissions";

export const apiConfig = {
  /** Opt-in: set `NEXT_PUBLIC_USE_MOCK=true` for legacy demo inventory (e2e). Production uses live/empty. */
  useMock: process.env.NEXT_PUBLIC_USE_MOCK === "true",
  /** Explicit API override; otherwise same-origin `/api/v1` via `apiV1BaseUrl()`. */
  baseUrl: process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "",
  authRequired: process.env.AUTH_REQUIRED === "true",
};

export function defaultGuestRole(): Role {
  return "operator";
}
