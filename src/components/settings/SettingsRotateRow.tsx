"use client";

import { PermissionGate } from "@/components/auth/SessionProvider";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useState } from "react";

/** Mock last-rotated date. Replace with real API data when available. */
const LAST_ROTATED_ISO = "2026-02-01T00:00:00Z";

function keyAgeWarning(lastRotatedIso: string): { days: number; warn: boolean } {
  const days = Math.floor((Date.now() - new Date(lastRotatedIso).getTime()) / 86_400_000);
  return { days, warn: days > 90 };
}

export function SettingsRotateRow() {
  const { toast } = useToast();
  const [rotating, setRotating] = useState(false);
  const { days, warn } = keyAgeWarning(LAST_ROTATED_ISO);

  const handleRotate = async () => {
    setRotating(true);
    try {
      await fetch("/api/v1/collector/keys/rotate", { method: "POST" });
      toast("API key rotated — update collectors immediately.", "success");
    } catch {
      toast("Rotation request failed — try again.", "danger");
    } finally {
      setRotating(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          readOnly
          value="bg_live_••••••••••••8f3c"
          className="flex-1 rounded-card border border-border-default bg-bg-base px-3 py-2 font-mono text-sm text-fg-muted"
        />
        <PermissionGate
          action="rotateKeys"
          fallback={
            <Button variant="secondary" type="button" disabled title="Admin role required">
              Rotate
            </Button>
          }
        >
          <Button
            variant="secondary"
            type="button"
            disabled={rotating}
            onClick={() => void handleRotate()}
          >
            {rotating ? "Rotating…" : "Rotate"}
          </Button>
        </PermissionGate>
      </div>
      <p className="text-xs text-fg-faint">
        Last rotated {days} day{days !== 1 ? "s" : ""} ago
        {warn ? (
          <span className="ml-2 rounded-full border border-warning/40 bg-warning-soft/60 px-1.5 py-0.5 text-[10px] font-medium text-warning">
            Rotate soon — &gt;90 days
          </span>
        ) : null}
      </p>
    </div>
  );
}
