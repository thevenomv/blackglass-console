"use server";

import { signSession } from "@/lib/auth/session-signing";
import { timingSafeEqual, createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkLoginRate } from "@/lib/server/rate-limit";

const SESSION = "bg-session";
const ROLE = "bg-role";

/**
 * Constant-time password check against AUTH_ADMIN_PASSWORD.
 * Uses SHA-256 digests to normalise length before timingSafeEqual.
 * Returns true when no password is configured (dev / AUTH_REQUIRED=false).
 *
 * TODO: When a `users` table is added and users can set their own passwords,
 * replace SHA-256 digest comparison with Argon2id verification using the
 * `argon2` npm package.  Argon2id is mandatory for any stored credential —
 * env-var deployment secrets do not require hashing, but DB-stored passwords do.
 */
function validatePassword(provided: string): boolean {
  const expected = process.env.AUTH_ADMIN_PASSWORD?.trim() ?? "";
  if (!expected) {
    return process.env.AUTH_REQUIRED !== "true";
  }
  const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();
  return timingSafeEqual(digest(provided), digest(expected));
}

/**
 * Assign role server-side: password configured and correct → admin,
 * no password set (dev mode) → operator.
 */
function resolveRole(provided: string): "admin" | "operator" {
  const expected = process.env.AUTH_ADMIN_PASSWORD?.trim() ?? "";
  return expected && provided ? "admin" : "operator";
}

async function getClientIp(): Promise<string> {
  // headers() is async in Next.js 15 Server Actions.
  const hdrs = await headers();
  const realIp = hdrs.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const xf = hdrs.get("x-forwarded-for");
  if (xf) {
    const parts = xf.split(",").map((s: string) => s.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  return "local";
}

export async function signIn(formData: FormData) {
  const jar = await cookies();
  const nextParam = String(formData.get("next") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const ip = await getClientIp();
  if (!checkLoginRate(ip)) {
    const qs = new URLSearchParams({ error: "too_many_attempts" });
    if (nextParam.startsWith("/") && !nextParam.startsWith("//")) qs.set("next", nextParam);
    redirect(`/login?${qs.toString()}`);
  }

  if (!validatePassword(password)) {
    const qs = new URLSearchParams({ error: "invalid_credentials" });
    if (nextParam.startsWith("/") && !nextParam.startsWith("//")) qs.set("next", nextParam);
    redirect(`/login?${qs.toString()}`);
  }

  const role = resolveRole(password);
  const token = await signSession({ role, iat: Date.now() });
  const maxAge = 60 * 60 * 24 * 7;
  const secure = process.env.NODE_ENV === "production";

  // Delete before set — explicit session rotation to prevent fixation
  jar.delete(SESSION);
  jar.delete(ROLE);

  jar.set(SESSION, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge,
    secure,
  });
  jar.set(ROLE, role, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge,
    secure,
  });
  // Validate the `next` path: only allow same-origin relative paths starting with /
  const safePath =
    nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";
  redirect(safePath);
}

export async function signOut() {
  const jar = await cookies();
  jar.delete(SESSION);
  jar.delete(ROLE);
  redirect("/login");
}

