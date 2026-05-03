"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DemoUpgradeModal } from "@/components/demo/DemoUpgradeModal";

type DemoCtx = {
  requestRealAction: (label?: string) => void;
};

const Ctx = createContext<DemoCtx | null>(null);

export function DemoWorkspaceProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState<string | undefined>();

  const requestRealAction = useCallback((actionLabel?: string) => {
    setLabel(actionLabel);
    setOpen(true);
  }, []);

  const value = useMemo(() => ({ requestRealAction }), [requestRealAction]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {open ? <DemoUpgradeModal attemptedAction={label} onClose={() => setOpen(false)} /> : null}
    </Ctx.Provider>
  );
}

export function useDemoWorkspace(): DemoCtx {
  const x = useContext(Ctx);
  if (!x) {
    throw new Error("useDemoWorkspace outside DemoWorkspaceProvider");
  }
  return x;
}
