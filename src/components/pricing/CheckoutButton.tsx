"use client";

import { useState } from "react";

interface CheckoutButtonProps {
  className: string;
  children: React.ReactNode;
}

export default function CheckoutButton({ className, children }: CheckoutButtonProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  async function handleClick() {
    setStatus("loading");
    try {
      const res = await fetch("/api/checkout", { method: "POST" });
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      const { url }: { url: string } = await res.json();
      window.location.href = url;
    } catch {
      setStatus("error");
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === "loading"}
      aria-busy={status === "loading"}
      className={className}
    >
      {status === "loading" ? "Redirecting to checkout…" : status === "error" ? "Something went wrong — try again" : children}
    </button>
  );
}
