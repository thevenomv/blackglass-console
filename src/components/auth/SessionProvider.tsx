"use client";

import type { Role } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/permissions";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type SessionState = {
  loading: boolean;
  role: Role;
  authenticated: boolean;
};

type SessionApi = SessionState & {
  refresh: () => Promise<void>;
  allowed: (action: Parameters<typeof can>[1]) => boolean;
};

const SessionContext = createContext<SessionApi | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({
    loading: true,
    role: "operator",
    authenticated: false,
  });

  const refresh = useCallback(async () => {
    const res = await fetch("/api/session", { cache: "no-store" });
    const data = (await res.json()) as SessionState & { authRequired?: boolean };
    setState({
      loading: false,
      role: data.role,
      authenticated: data.authenticated,
    });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      ...state,
      refresh,
      allowed: (action: Parameters<typeof can>[1]) => can(state.role, action),
    }),
    [state, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession requires SessionProvider");
  return ctx;
}

export function PermissionGate({
  action,
  children,
  fallback = null,
}: {
  action: Parameters<typeof can>[1];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { loading, allowed } = useSession();
  if (loading) return null;
  if (!allowed(action)) return fallback;
  return children;
}
