"use server";

import { signSession } from "@/lib/auth/session-signing";
import { timingSafeEqual, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const SESSION = "bg-session";
const ROLE = "bg-role";

/**
 * Constant-time password check against AUTH_ADMIN_PASSWORD.
 * Uses SHA-256 digests to normalise length before timingSafeEqual.
 * Returns true when no password is configured (dev / AUTH_REQUIRED=false).
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

export async function signIn(formData: FormData) {
  const jar = await cookies();
  const nextParam = String(formData.get("next") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!validatePassword(password)) {
    const qs = new URLSearchParams({ error: "invalid_credentials" });
    if (nextParam.startsWith("/") && !nextParam.startsWith("//")) qs.set("next", nextParam);
    redirect(`/login?${qs.toString()}`);
  }

  const role = resolveRole(password);
  const token = await signSession({ role, iat: Date.now() });
  const maxAge = 60 * 60 * 24 * 7;
  const secure = process.env.NODE_ENV === "production";

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
