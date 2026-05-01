"use client";

import { PermissionGate } from "@/components/auth/SessionProvider";
import { RunScanButton } from "@/components/dashboard/RunScanButton";
import { Button } from "@/components/ui/Button";

export function BaselinesToolbar() {
  return (
    <div className="flex flex-wrap gap-2">
      <RunScanButton />
      <Button variant="secondary" type="button">
        Only changes
      </Button>
      <PermissionGate action="acceptBaseline">
        <Button type="button">Accept as new baseline</Button>
      </PermissionGate>
    </div>
  );
}
