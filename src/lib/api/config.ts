import type { Role } from "@/lib/auth/permissions";

export const apiConfig = {
  useMock: process.env.NEXT_PUBLIC_USE_MOCK !== "false",
  /** Explicit API override; otherwise same-origin `/api/v1` via `apiV1BaseUrl()`. */
  baseUrl: process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "",
  authRequired: process.env.AUTH_REQUIRED === "true",
};

export function defaultGuestRole(): Role {
  return "operator";
}
