"use client";

import { useScanJobs } from "@/components/providers/ScanJobsProvider";
import { useSession } from "@/components/auth/SessionProvider";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

type PaletteItem = {
  id: string;
  label: string;
  hint?: string;
  /** Free-text bag the matcher searches through. */
  keywords?: string;
  href?: string;
  action?: () => void | Promise<void>;
  /** Section grouping for headers. Defaults to none (renders inline). */
  section?: "Recent" | "Hosts" | "Drift" | "Routes" | "Actions";
  /** Optional right-side keyboard hint (decorative). */
  shortcut?: string;
};

const ROUTES: PaletteItem[] = [
  {
    id: "dash",
    label: "Fleet dashboard",
    hint: "Overview · KPIs",
    href: "/dashboard",
    keywords: "home overview",
    section: "Routes",
  },
  {
    id: "hosts",
    label: "Hosts inventory",
    href: "/hosts",
    keywords: "fleet linux servers",
    section: "Routes",
  },
  {
    id: "baselines",
    label: "Baselines",
    href: "/baselines",
    keywords: "snapshot diff trusted",
    section: "Routes",
  },
  {
    id: "drift",
    label: "Drift events",
    href: "/drift",
    keywords: "delta integrity findings",
    section: "Routes",
  },
  {
    id: "workspace",
    label: "Incident workspace",
    href: "/workspace",
    keywords: "incident runbook triage",
    section: "Routes",
  },
  {
    id: "evidence",
    label: "Evidence bundles",
    href: "/evidence",
    keywords: "export audit zip",
    section: "Routes",
  },
  { id: "reports", label: "Reports", href: "/reports", keywords: "pdf digest", section: "Routes" },
  {
    id: "demo",
    label: "Sample workspace (demo)",
    href: "/demo",
    keywords: "walkthrough fictional sample",
    section: "Routes",
  },
  {
    id: "welcome",
    label: "Get started",
    href: "/welcome",
    keywords: "onboarding setup",
    section: "Routes",
  },
  {
    id: "settings",
    label: "Settings",
    href: "/settings",
    keywords: "configuration preferences",
    section: "Routes",
  },
  {
    id: "settings-integrations",
    label: "Settings · Integrations",
    href: "/settings#integrations",
    keywords: "slack webhook splunk datadog jira github linear servicenow asff sentinel",
    section: "Routes",
  },
  {
    id: "settings-billing",
    label: "Settings · Billing",
    href: "/settings#billing",
    keywords: "subscription stripe plan invoice",
    section: "Routes",
  },
  {
    id: "settings-api-keys",
    label: "Settings · API keys",
    href: "/settings#api-keys",
    keywords: "tokens ci automation programmatic",
    section: "Routes",
  },
  {
    id: "login",
    label: "Sign in",
    href: "/login",
    keywords: "sign in session auth",
    section: "Routes",
  },
];

// ---------------------------------------------------------------------------
// Drift quick-filter actions — pre-built /drift queries the user runs often.
// ---------------------------------------------------------------------------
const DRIFT_QUICK_FILTERS: PaletteItem[] = [
  {
    id: "drift-open-high",
    label: "Show open · high severity drift",
    href: "/drift?severity=high&lifecycle=open",
    keywords: "high critical open drift triage",
    section: "Drift",
  },
  {
    id: "drift-open-medium",
    label: "Show open · medium severity drift",
    href: "/drift?severity=medium&lifecycle=open",
    keywords: "medium open drift",
    section: "Drift",
  },
  {
    id: "drift-open-all",
    label: "Show all open drift",
    href: "/drift?lifecycle=open",
    keywords: "open drift queue triage",
    section: "Drift",
  },
  {
    id: "drift-resolved",
    label: "Show resolved drift",
    href: "/drift?lifecycle=resolved",
    keywords: "closed resolved history",
    section: "Drift",
  },
];

function matches(q: string, item: PaletteItem) {
  if (!q.trim()) return true;
  const n = q.trim().toLowerCase();
  const hay = `${item.label} ${item.hint ?? ""} ${item.keywords ?? ""}`.toLowerCase();
  return hay.includes(n);
}

const RECENT_KEY = "bg-recent-pages";
const MAX_RECENT = 5;

function readRecent(): PaletteItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const ids = JSON.parse(raw) as string[];
    return ids
      .map((id) => ROUTES.find((r) => r.id === id))
      .filter((r): r is PaletteItem => r !== undefined)
      .map((r) => ({ ...r, section: "Recent" as const }));
  } catch {
    return [];
  }
}

function persistRecent(item: PaletteItem) {
  if (!item.href) return;
  // Only persist top-level routes (not host-jump or quick-filter actions); the
  // recents block exists to give the user fast re-access to surfaces they
  // navigate to repeatedly, not to remember which random host they opened.
  if (!ROUTES.some((r) => r.id === item.id)) return;
  try {
    const current = readRecent();
    const next = [item, ...current.filter((r) => r.id !== item.id)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next.map((r) => r.id)));
  } catch {
    // storage not available — silently skip
  }
}

// ---------------------------------------------------------------------------
// Live host search — hits /api/v1/hosts and filters client-side. Cached for
// the lifetime of the palette session so re-typing doesn't refetch.
// ---------------------------------------------------------------------------
type HostHit = { id: string; hostname: string; os?: string };

let hostCache: HostHit[] | null = null;
let hostCacheLoadedAt = 0;
const HOST_CACHE_TTL_MS = 30_000;

async function fetchHosts(signal: AbortSignal): Promise<HostHit[]> {
  const now = Date.now();
  if (hostCache && now - hostCacheLoadedAt < HOST_CACHE_TTL_MS) {
    return hostCache;
  }
  const res = await fetch("/api/v1/hosts", { signal, headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const json = (await res.json()) as { items?: HostHit[] };
  const items = (json.items ?? []).map((h) => ({ id: h.id, hostname: h.hostname, os: h.os }));
  hostCache = items;
  hostCacheLoadedAt = now;
  return items;
}

export function CommandPalette() {
  const router = useRouter();
  const { loading, allowed } = useSession();
  const { startFleetScan } = useScanJobs();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [hostHits, setHostHits] = useState<PaletteItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const closePalette = useCallback(() => {
    setQuery("");
    setOpen(false);
    setHostHits([]);
  }, []);
  const trapRef = useFocusTrap(open, closePalette);

  // Action items — gated by permission, surfaced above route results.
  const actions = useMemo<PaletteItem[]>(() => {
    if (loading || !allowed("runScan")) return [];
    return [
      {
        id: "run-scan",
        label: "Run fleet integrity scan",
        hint: "POST /api/v1/scans across configured collectors",
        keywords: "jobs collectors scan fleet integrity run",
        action: () => void startFleetScan(),
        section: "Actions",
        shortcut: "↵",
      },
    ];
  }, [allowed, loading, startFleetScan]);

  // Filter routes + drift quick-filters by the query.
  const matchingRoutes = useMemo(
    () => ROUTES.filter((r) => matches(query, r)),
    [query],
  );
  const matchingDrift = useMemo(
    () => DRIFT_QUICK_FILTERS.filter((r) => matches(query, r)),
    [query],
  );
  const matchingActions = useMemo(
    () => actions.filter((a) => matches(query, a)),
    [actions, query],
  );

  // Live host search — fires once query is ≥ 2 chars. Cached for 30s so
  // typing/backspacing within the same session is instant. We keep the early
  // exit out of the effect body and into the input onChange handler to avoid
  // synchronous setState-in-effect.
  useEffect(() => {
    if (!open) return;
    const q = query.trim().toLowerCase();
    if (q.length < 2) return;
    const ctl = new AbortController();
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const hosts = await fetchHosts(ctl.signal);
          if (cancelled) return;
          const hits = hosts
            .filter(
              (h) =>
                h.id.toLowerCase().includes(q) ||
                h.hostname.toLowerCase().includes(q) ||
                (h.os ?? "").toLowerCase().includes(q),
            )
            .slice(0, 6)
            .map<PaletteItem>((h) => ({
              id: `host-${h.id}`,
              label: h.hostname,
              hint: `${h.id}${h.os ? ` · ${h.os}` : ""}`,
              href: `/hosts/${encodeURIComponent(h.id)}`,
              section: "Hosts",
            }));
          setHostHits(hits);
        } catch {
          // fetch error or abort — leave list empty rather than show stale
        }
      })();
    }, 120);
    return () => {
      cancelled = true;
      ctl.abort();
      window.clearTimeout(t);
    };
  }, [open, query]);

  const recents = useMemo(() => (open && !query.trim() ? readRecent() : []), [open, query]);

  // Build the flat displayed list with section headers. Recents first when
  // the query is empty, then Actions, then Hosts (if any), Drift filters,
  // and finally Routes.
  type Row =
    | { kind: "header"; label: string }
    | { kind: "item"; item: PaletteItem; selectableIndex: number };

  const rows: Row[] = [];
  let selectableIndex = 0;
  const pushSection = (label: string, items: PaletteItem[]) => {
    if (items.length === 0) return;
    rows.push({ kind: "header", label });
    for (const item of items) {
      rows.push({ kind: "item", item, selectableIndex });
      selectableIndex += 1;
    }
  };

  if (recents.length > 0) pushSection("Recent", recents);
  if (matchingActions.length > 0) pushSection("Actions", matchingActions);
  if (hostHits.length > 0) pushSection("Hosts", hostHits);
  if (matchingDrift.length > 0) pushSection("Drift", matchingDrift);
  if (matchingRoutes.length > 0) pushSection("Routes", matchingRoutes);

  const selectableItems: PaletteItem[] = rows
    .filter((r): r is Extract<Row, { kind: "item" }> => r.kind === "item")
    .map((r) => r.item);

  const selectableCount = selectableItems.length;
  const safeActive = selectableCount > 0 ? Math.min(active, selectableCount - 1) : 0;

  const activate = useCallback(
    (idx: number) => {
      const item = selectableItems[idx];
      if (!item) return;
      setOpen(false);
      setQuery("");
      setHostHits([]);
      if (item.href) {
        persistRecent(item);
        router.push(item.href);
      } else {
        void item.action?.();
      }
    },
    [router, selectableItems],
  );

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => {
          if (v) {
            setQuery("");
            setHostHits([]);
            return false;
          }
          return true;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  const onInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (selectableCount === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((prev) => {
        const cur = Math.min(prev, selectableCount - 1);
        return Math.min(selectableCount - 1, cur + 1);
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((prev) => {
        const cur = Math.min(prev, selectableCount - 1);
        return Math.max(0, cur - 1);
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      activate(safeActive);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex justify-center bg-overlay-scrim px-4 pt-[15vh] backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={closePalette}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-label="Command palette"
        className="flex max-h-[min(480px,75vh)] w-full max-w-xl flex-col overflow-hidden rounded-card border border-border-default bg-bg-panel shadow-elevated outline-none"
        onMouseDown={(ev) => ev.stopPropagation()}
      >
        <div className="border-b border-border-subtle px-4 py-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-fg-faint">
            Jump · Search · Run
          </p>
          <input
            ref={inputRef}
            type="search"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search routes, hosts, drift filters…"
            value={query}
            onChange={(e) => {
              const next = e.target.value;
              setQuery(next);
              setActive(0);
              // Clear stale host hits the moment the query becomes too short
              // for the host-search effect to refresh them.
              if (next.trim().length < 2 && hostHits.length > 0) {
                setHostHits([]);
              }
            }}
            onKeyDown={onInputKeyDown}
            className="mt-2 w-full rounded-md border border-border-default bg-bg-base px-3 py-2 text-sm text-fg-primary outline-none ring-accent-blue focus:ring-2"
          />
          <p className="mt-2 text-[11px] text-fg-faint">
            <kbd className="rounded border border-border-default px-1 font-mono text-[10px]">⌘</kbd>{" "}
            <kbd className="rounded border border-border-default px-1 font-mono text-[10px]">K</kbd>{" "}
            toggle · arrows navigate · enter opens · type a hostname to jump
          </p>
        </div>
        <ul className="flex-1 overflow-y-auto p-2" role="listbox">
          {selectableCount === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-fg-muted">No matches</li>
          ) : (
            rows.map((row, rowIdx) => {
              if (row.kind === "header") {
                return (
                  <li key={`hdr-${row.label}-${rowIdx}`}>
                    <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-faint">
                      {row.label}
                    </p>
                  </li>
                );
              }
              const { item, selectableIndex } = row;
              const isActive = selectableIndex === safeActive;
              return (
                <li
                  key={`${item.section ?? "route"}-${item.id}`}
                  role="option"
                  aria-selected={isActive}
                >
                  <button
                    type="button"
                    className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                      isActive
                        ? "bg-accent-blue-soft text-fg-primary"
                        : "text-fg-muted hover:bg-bg-elevated"
                    }`}
                    onMouseEnter={() => setActive(selectableIndex)}
                    onClick={() => activate(selectableIndex)}
                  >
                    <span className="flex min-w-0 flex-col items-start">
                      <span className="font-medium text-fg-primary">{item.label}</span>
                      {item.hint ? (
                        <span className="mt-0.5 truncate text-xs text-fg-faint">{item.hint}</span>
                      ) : null}
                    </span>
                    {item.shortcut ? (
                      <kbd className="rounded border border-border-default px-1 font-mono text-[10px] text-fg-faint">
                        {item.shortcut}
                      </kbd>
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <div className="border-t border-border-subtle px-4 py-2 text-[11px] text-fg-faint">
          BLACKGLASS · Obsidian Dynamics Limited
        </div>
      </div>
    </div>
  );
}
