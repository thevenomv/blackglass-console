"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const SESSION = "bg-session";
const ROLE = "bg-role";

const ROLES = ["auditor", "operator", "admin"] as const;

export async function signIn(formData: FormData) {
  const jar = await cookies();
  const raw = String(formData.get("role") ?? "operator");
  const role = ROLES.includes(raw as (typeof ROLES)[number]) ? raw : "operator";

  jar.set(SESSION, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === "production",
  });
  jar.set(ROLE, role, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === "production",
  });
  redirect("/");
}

export async function signOut() {
  const jar = await cookies();
  jar.delete(SESSION);
  jar.delete(ROLE);
  redirect("/login");
}
