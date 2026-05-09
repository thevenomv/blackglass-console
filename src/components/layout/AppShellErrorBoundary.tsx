"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "@/components/ui/EmptyState";

/**
 * Client-side error boundary for the (app) tree.
 *
 * Complementary to the route-level `error.tsx` files — those handle
 * errors thrown during initial render of server components (which
 * Next.js routes through the App Router error pipeline). This
 * component catches errors thrown later in a component's lifecycle:
 * useEffect/useState bugs, callback handlers, click handlers that
 * do something stupid, etc. Without this, a single broken card on
 * the dashboard takes down the entire (app) chrome.
 *
 * The boundary preserves the sidebar / topbar / banners and renders
 * an inline ErrorState card in the main content area. A "Retry" button
 * resets the boundary state so the user can attempt to re-render
 * without a hard refresh.
 *
 * Reports to Sentry via dynamic import so this stays no-op when
 * Sentry isn't configured.
 */

type Props = { children: ReactNode };

type State = { error: Error | null };

export class AppShellErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (typeof console !== "undefined") {
      console.error("[AppShellErrorBoundary] component crashed:", error, info.componentStack);
    }
    void import("@sentry/nextjs")
      .then(({ captureException }) => {
        captureException(error, {
          tags: { boundary: "AppShellErrorBoundary" },
          extra: { componentStack: info.componentStack },
        });
      })
      .catch(() => {
        // Sentry not configured — fine, log already covers it.
      });
  }

  handleReset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-start gap-4 px-6 py-10">
          <ErrorState
            title="A workspace component crashed"
            description={
              this.state.error.message ||
              "The page chrome is intact, but the active panel could not render. Retry, or refresh the page if the fault persists."
            }
            retryLabel="Retry render"
            onRetry={this.handleReset}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
