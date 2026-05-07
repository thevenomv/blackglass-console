"use client";

/**
 * SettingsTabs — vertical (desktop) / horizontal (mobile) tabbed shell for
 * the /settings page.
 *
 * Why a client component on a mostly-server page?
 *   The 19+ settings sections used to render in one long scroll. The
 *   navigation pattern needs:
 *     1. Deep-linkable tabs (`/settings?tab=collectors` survives refresh)
 *     2. No flash of all-content on initial load (SSR picks the right tab)
 *     3. Cheap tab switching (no re-fetch, panel state preserved)
 *   We achieve #1 + #2 with `useSearchParams` (Next.js gives us the value
 *   server-side too) and #3 by mounting all panels and toggling visibility.
 *
 * Each child must be wrapped in a <SettingsPanel id="..."> the parent provides;
 * we read those ids and surface them as the navigation list.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";

export type SettingsTab = {
  id: string;
  label: string;
  icon?: ReactNode;
  description?: string;
};

const ActiveTabContext = createContext<string>("");

export function SettingsTabs({
  tabs,
  defaultTab,
  children,
}: {
  tabs: SettingsTab[];
  defaultTab: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initial = useMemo(() => {
    const param = searchParams.get("tab");
    if (param && tabs.some((t) => t.id === param)) return param;
    return defaultTab;
  }, [searchParams, tabs, defaultTab]);

  const [active, setActive] = useState(initial);

  // Keep state aligned if the user uses browser back/forward to change ?tab.
  useEffect(() => {
    if (initial !== active) setActive(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const select = useCallback(
    (id: string) => {
      setActive(id);
      const url = new URL(window.location.href);
      if (id === defaultTab) url.searchParams.delete("tab");
      else url.searchParams.set("tab", id);
      router.replace(url.pathname + url.search, { scroll: false });
      // Bring the panel into view on mobile (where the rail is on top).
      requestAnimationFrame(() => {
        document.getElementById(`settings-panel-${id}`)?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    },
    [defaultTab, router],
  );

  return (
    <ActiveTabContext.Provider value={active}>
    <div
      data-active-tab={active}
      className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)] md:items-start"
    >
      {/* Tab rail */}
      <nav
        aria-label="Settings sections"
        className="md:sticky md:top-6 md:self-start"
      >
        <ul
          role="tablist"
          aria-orientation="vertical"
          className="flex gap-1 overflow-x-auto rounded-card border border-border-default bg-bg-panel p-1.5 md:flex-col md:overflow-visible"
        >
          {tabs.map((tab) => {
            const isActive = tab.id === active;
            return (
              <li key={tab.id} className="shrink-0 md:shrink">
                <button
                  type="button"
                  role="tab"
                  id={`settings-tab-${tab.id}`}
                  aria-selected={isActive}
                  aria-controls={`settings-panel-${tab.id}`}
                  onClick={() => select(tab.id)}
                  className={`flex w-full items-center gap-2.5 rounded-card px-3 py-2 text-left text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-bg-elevated text-fg-primary"
                      : "text-fg-muted hover:bg-bg-elevated/60 hover:text-fg-primary"
                  }`}
                >
                  {tab.icon ? (
                    <span
                      aria-hidden="true"
                      className={`flex h-4 w-4 shrink-0 items-center justify-center text-[15px] ${isActive ? "text-accent-blue" : "text-fg-faint"}`}
                    >
                      {tab.icon}
                    </span>
                  ) : null}
                  <span className="truncate">{tab.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Panels */}
      <div className="min-w-0 space-y-6">{children}</div>
    </div>
    </ActiveTabContext.Provider>
  );
}

/** Wrapper for a single settings tab panel; rendered (visible) only when
 *  its id matches the active tab from SettingsTabs context. Panels are
 *  kept mounted but hidden so transient form state is preserved across
 *  tab switches. */
export function SettingsPanel({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const active = useContext(ActiveTabContext);
  const isActive = active === id;
  return (
    <section
      id={`settings-panel-${id}`}
      role="tabpanel"
      aria-labelledby={`settings-tab-${id}`}
      hidden={!isActive}
      className="space-y-6"
    >
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-fg-primary">{title}</h2>
        {description ? <p className="text-sm text-fg-muted">{description}</p> : null}
      </header>
      <div className="space-y-6">{children}</div>
    </section>
  );
}
