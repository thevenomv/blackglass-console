"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

/**
 * Renders outside the root layout — keep self-contained (no ThemeProvider / global CSS).
 * Palette matches default light shell tokens for a calm recovery path.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en-GB">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#f1f5f9" />
        <title>Error · BLACKGLASS</title>
      </head>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
          background: "#f1f5f9",
          color: "#0f172a",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.12em", color: "#2563eb" }}>
          APPLICATION ERROR
        </p>
        <h1 style={{ marginTop: "1rem", fontSize: "1.375rem", fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ marginTop: "0.75rem", maxWidth: "28rem", fontSize: "0.875rem", color: "#475569", lineHeight: 1.6 }}>
          An unexpected error occurred. You can try again, or return home. If this persists, contact your administrator
          with the time of the error{error.digest ? ` (ref: ${error.digest})` : ""}.
        </p>
        <div style={{ marginTop: "1.5rem", display: "flex", flexWrap: "wrap", gap: "0.75rem", justifyContent: "center" }}>
          <Link
            href="/"
            style={{
              display: "inline-block",
              borderRadius: "8px",
              background: "#2563eb",
              color: "#fff",
              padding: "0.625rem 1.25rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            Go home
          </Link>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              background: "#fff",
              color: "#0f172a",
              padding: "0.625rem 1.25rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
