"use client";

/**
 * Saved drift-filter views.
 *
 * Operators triaging drift end up re-typing the same filter combos
 * ("only high-severity new on host db-01", "everything triaged this week",
 * etc.). This component captures the current `searchParams` set into a
 * named, user-local slot and lets the operator restore it with one click.
 *
 * Storage: per-browser localStorage (matches the dashboard onboarding
 * checklist). No server round-trip, no per-tenant collision; per-user
 * is the right granularity since different operators care about
 * different slices.
 *
 * State propagation: useSyncExternalStore so the dropdown stays in sync
 * with sibling tabs that also save / delete views.
 */

import { useCallback, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const STORAGE_KEY = "blackglass.drift.savedViews.v1";
const MAX_VIEWS = 20;

interface SavedView {
  /** UUID-style id; safe to use as React key. */
  id: string;
  name: string;
  /** Stringified URLSearchParams — restore via `?<query>`. */
  query: string;
  createdAt: string;
}

interface PersistedShape {
  views: SavedView[];
}

const EMPTY: PersistedShape = { views: [] };

// ---------------------------------------------------------------------------
// External store
// ---------------------------------------------------------------------------

let cachedSnapshot: PersistedShape | null = null;
const listeners = new Set<() => void>();

function readSnapshot(): PersistedShape {
  if (cachedSnapshot) return cachedSnapshot;
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cachedSnapshot = { views: [] };
      return cachedSnapshot;
    }
    const parsed = JSON.parse(raw) as Partial<PersistedShape>;
    cachedSnapshot = {
      views: Array.isArray(parsed.views)
        ? parsed.views
            .filter((v): v is SavedView =>
              !!v &&
              typeof v.id === "string" &&
              typeof v.name === "string" &&
              typeof v.query === "string",
            )
            .slice(0, MAX_VIEWS)
        : [],
    };
    return cachedSnapshot;
  } catch {
    cachedSnapshot = { views: [] };
    return cachedSnapshot;
  }
}

function commit(next: PersistedShape) {
  cachedSnapshot = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Quota / private mode — fail silently (in-memory state still updates).
    }
  }
  for (const l of listeners) l();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const handler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      cachedSnapshot = null;
      onChange();
    }
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", handler);
  }
  return () => {
    listeners.delete(onChange);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", handler);
    }
  };
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `view-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

/**
 * Strip params we don't want baked into a saved view (currently the per-row
 * `event` selection). The filter set should remain stable across reloads
 * but the focused event should not leak across navigation.
 */
function relevantParams(sp: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  for (const key of ["severity", "lifecycle", "host"]) {
    const v = sp.get(key);
    if (v) out.set(key, v);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SavedDriftViews() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const state = useSyncExternalStore(subscribe, readSnapshot, () => EMPTY);
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [draftName, setDraftName] = useState("");

  const currentParams = relevantParams(searchParams);
  const currentQuery = currentParams.toString();

  // Saving the current filter set is only useful if at least one filter is
  // active — otherwise it's just "the default view" which is one click away.
  const canSave = currentQuery.length > 0;

  const handleSave = useCallback(() => {
    const trimmed = draftName.trim();
    if (!trimmed) return;
    const prev = readSnapshot();
    // Replace by name (case-insensitive) — saving twice with the same label
    // overwrites, matching how chrome bookmarks behave.
    const lower = trimmed.toLowerCase();
    const filtered = prev.views.filter((v) => v.name.toLowerCase() !== lower);
    const next: PersistedShape = {
      views: [
        {
          id: newId(),
          name: trimmed,
          query: currentQuery,
          createdAt: new Date().toISOString(),
        },
        ...filtered,
      ].slice(0, MAX_VIEWS),
    };
    commit(next);
    setDraftName("");
    setNaming(false);
  }, [draftName, currentQuery]);

  const handleLoad = useCallback(
    (view: SavedView) => {
      router.replace(view.query ? `${pathname}?${view.query}` : pathname);
      setOpen(false);
    },
    [router, pathname],
  );

  const handleDelete = useCallback((id: string) => {
    const prev = readSnapshot();
    commit({ views: prev.views.filter((v) => v.id !== id) });
  }, []);

  // Match: the active filter set lines up with this saved view exactly.
  const activeViewId = state.views.find((v) => v.query === currentQuery)?.id ?? null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-md border border-border-default bg-bg-base px-2.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:border-border-strong hover:text-fg-primary"
        title="Save and recall named filter combinations"
      >
        <span>{activeViewId ? state.views.find((v) => v.id === activeViewId)?.name ?? "Views" : "Views"}</span>
        <span className="rounded bg-bg-elevated px-1 text-[10px] text-fg-faint">
          {state.views.length}
        </span>
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden>
          <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <>
          {/* Click-outside backdrop */}
          <button
            type="button"
            aria-label="Close saved views"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => {
              setOpen(false);
              setNaming(false);
            }}
          />
          <div
            role="menu"
            className="absolute right-0 z-40 mt-1 w-72 overflow-hidden rounded-card border border-border-default bg-bg-panel shadow-elevated"
          >
            <div className="border-b border-border-subtle px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-faint">
                Saved views
              </p>
              <p className="mt-0.5 text-[11px] text-fg-faint">
                Per-browser. Restores severity / lifecycle / host filters.
              </p>
            </div>

            {state.views.length === 0 ? (
              <div className="px-3 py-3 text-xs text-fg-muted">
                No saved views yet — apply some filters then save below.
              </div>
            ) : (
              <ul className="max-h-64 overflow-y-auto">
                {state.views.map((view) => (
                  <li
                    key={view.id}
                    className={`flex items-center gap-2 border-b border-border-subtle px-3 py-2 last:border-b-0 ${
                      view.id === activeViewId ? "bg-accent-blue/5" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleLoad(view)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p
                        className={`truncate text-xs font-medium ${
                          view.id === activeViewId ? "text-accent-blue" : "text-fg-primary"
                        }`}
                      >
                        {view.name}
                      </p>
                      <p className="truncate font-mono text-[10px] text-fg-faint">
                        ?{view.query}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(view.id)}
                      aria-label={`Delete saved view ${view.name}`}
                      title="Delete"
                      className="shrink-0 rounded-md px-1.5 py-0.5 text-fg-faint transition-colors hover:bg-danger/10 hover:text-danger"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="border-t border-border-subtle px-3 py-2">
              {naming ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSave();
                  }}
                  className="flex gap-1.5"
                >
                  <input
                    autoFocus
                    type="text"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder="View name"
                    maxLength={48}
                    className="flex-1 rounded-md border border-border-default bg-bg-base px-2 py-1 text-xs text-fg-primary outline-none ring-accent-blue focus:ring-2"
                  />
                  <button
                    type="submit"
                    disabled={!draftName.trim()}
                    className="rounded-md bg-accent-blue px-2 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNaming(false);
                      setDraftName("");
                    }}
                    className="rounded-md border border-border-default px-2 py-1 text-xs text-fg-muted transition-colors hover:border-border-strong"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setNaming(true)}
                  disabled={!canSave}
                  title={canSave ? "Save current filters as a named view" : "Apply at least one filter to save"}
                  className="w-full rounded-md border border-border-default bg-bg-elevated px-2 py-1 text-xs font-medium text-fg-muted transition-colors hover:border-accent-blue hover:text-accent-blue disabled:opacity-50 disabled:hover:border-border-default disabled:hover:text-fg-muted"
                >
                  + Save current filters
                </button>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
