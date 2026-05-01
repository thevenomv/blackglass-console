"use client";

import { PermissionGate } from "@/components/auth/SessionProvider";
import { Button } from "@/components/ui/Button";

export function SettingsRotateRow() {
  return (
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
        <Button variant="secondary" type="button">
          Rotate
        </Button>
      </PermissionGate>
    </div>
  );
}
