"use client";

import { useState } from "react";

export function GenerateInviteButton() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setState("loading");
    try {
      const res = await fetch("/api/auth/generate-invite", { method: "POST" });
      if (!res.ok) {
        setState("error");
        return;
      }
      const data = (await res.json()) as { invite_url: string; note: string };
      setInviteUrl(data.invite_url);
      setState("done");
    } catch {
      setState("error");
    }
  }

  async function handleCopy() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (state === "idle" || state === "loading") {
    return (
      <button
        type="button"
        onClick={handleGenerate}
        disabled={state === "loading"}
        className="inline-flex h-8 items-center rounded-md border border-border-default px-3 text-xs text-fg-muted transition-colors hover:border-accent-blue hover:text-accent-blue disabled:opacity-50"
      >
        {state === "loading" ? "Generating…" : "Generate invite link"}
      </button>
    );
  }

  if (state === "error") {
    return (
      <p className="text-xs text-red-400">
        Failed to generate invite. Ensure you are signed in as admin.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-muted">
        Share this one-time link with your customer. It grants a 30-day read-only session.
        Add the token to <span className="font-mono text-fg-primary">INVITE_TOKENS</span> before sharing.
      </p>
      <div className="flex items-center gap-2 rounded-card border border-border-default bg-bg-base px-3 py-2">
        <span className="flex-1 truncate font-mono text-xs text-fg-primary">{inviteUrl}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded border border-border-subtle px-2 py-0.5 text-xs text-fg-muted transition-colors hover:text-fg-primary"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <button
        type="button"
        onClick={() => { setState("idle"); setInviteUrl(null); }}
        className="self-start text-xs text-fg-faint hover:text-fg-muted"
      >
        Generate another
      </button>
    </div>
  );
}
