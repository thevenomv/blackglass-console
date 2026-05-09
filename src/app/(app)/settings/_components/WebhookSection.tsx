"use client";

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useState } from "react";

export function WebhookSection() {
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [testing, setTesting] = useState(false);
  const [lastTestResult, setLastTestResult] = useState<"ok" | "fail" | null>(null);

  const handleTest = async () => {
    if (!url) {
      toast("Enter a webhook URL first.", "warning");
      return;
    }
    setTesting(true);
    setLastTestResult(null);
    try {
      const res = await fetch("/api/v1/webhooks/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          detail?: string;
          error?: string;
          message?: string;
        };
        const detail = body.detail ?? body.message ?? body.error ?? `HTTP ${res.status}`;
        setLastTestResult("fail");
        toast(`Delivery failed: ${detail}`, "danger");
        return;
      }
      setLastTestResult("ok");
      toast("Test event delivered — check your endpoint logs.", "success");
    } catch (err) {
      setLastTestResult("fail");
      const detail = err instanceof Error ? err.message : "network error";
      toast(`Delivery failed: ${detail}`, "danger");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="url"
          placeholder="https://hooks.example.com/blackglass"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1 rounded-card border border-border-default bg-bg-base px-3 py-2 text-sm text-fg-primary outline-none ring-accent-blue focus:ring-2"
          aria-label="Webhook URL"
        />
        <Button
          variant="secondary"
          type="button"
          disabled={testing || !url}
          onClick={() => void handleTest()}
        >
          {testing ? "Sending…" : "Send test"}
        </Button>
      </div>
      {lastTestResult === "ok" ? (
        <p className="text-xs text-success">Last test event delivered successfully.</p>
      ) : lastTestResult === "fail" ? (
        <p className="text-xs text-danger">Last test event failed — check endpoint availability.</p>
      ) : null}
    </div>
  );
}
