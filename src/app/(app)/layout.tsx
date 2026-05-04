import type { ReactNode } from "react";

/** Authenticated / workspace product surface — URLs unchanged by this route group. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
