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
  keywords?: string;
  href?: string;
  action?: () => void | Promise<void>;
};

const ROUTES: PaletteItem[] = [
  { id: "dash", label: "Fleet dashboard", hint: "Overview · KPIs", href: "/", keywords: "home" },
  { id: "hosts", label: "Hosts inventory", href: "/hosts", keywords: "fleet linux" },
  { id: "baselines", label: "Baselines", href: "/baselines", keywords: "snapshot diff" },
  { id: "drift", label: "Drift events", href: "/drift", keywords: "delta integrity" },
  {
    id: "workspace",
    label: "Incident workspace",
    hint: "INC mock · tasks",
    href: "/workspace",
    keywords: "incident runbook",
  },
  { id: "evidence", label: "Evidence bundles", href: "/evidence", keywords: "export audit" },
  { id: "reports", label: "Reports", href: "/reports", keywords: "pdf digest" },
  { id: "demo", label: "Partner demo script", href: "/demo", keywords: "walkthrough" },
  { id: "settings", label: "Settings", href: "/settings", keywords: "rotate keys" },
  {
    id: "login",
    label: "Sign in",
    href: "/login",
    keywords: "sign in session auth",
  },
  {
    id: "host-seed",
    label: "Host detail · host-07",
    hint: "Investigation seed",
    href: "/hosts/host-07",
    keywords: "detail drill",
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
      .filter((r): r is PaletteItem => r !== undefined);
  } catch {
    return [];
  }
}

function persistRecent(item: PaletteItem) {
  if (!item.href) return;
  try {
    const current = readRecent();
    const next = [item, ...current.filter((r) => r.id !== item.id)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next.map((r) => r.id)));
  } catch {
    // storage not available — silently skip
  }
}

export function CommandPalette() {
  const router = useRouter();
  const { loading, allowed } = useSession();
  const { startFleetScan } = useScanJobs();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const closePalette = useCallback(() => {
    setQuery("");
    setOpen(false);
  }, []);
  const trapRef = useFocusTrap(open, closePalette);

  const items = useMemo(() => {
    const scanItem: PaletteItem | null =
      loading || !allowed("runScan")
        ? null
        : {
            id: "run-scan",
            label: "Run fleet integrity scan",
            hint: "Starts POST /api/v1/scans when live mode",
            keywords: "jobs collectors",
            action: () => void startFleetScan(),
          };
    const base = scanItem ? [scanItem, ...ROUTES] : ROUTES;
    return base.filter((i) => matches(query, i));
  }, [allowed, loading, query, startFleetScan]);

  const recents = useMemo(() => (open ? readRecent() : []), [open]);

  const showRecentBlock = Boolean(open && !query.trim() && recents.length > 0);

  const selectableCount =
    query.trim().length > 0
      ? items.length
      : showRecentBlock
        ? recents.length + items.length
        : items.length;

  const safeActive = selectableCount > 0 ? Math.min(active, selectableCount - 1) : 0;

  const resolveSelectableItem = useCallback(
    (idx: number): PaletteItem | undefined => {
      if (query.trim().length > 0) return items[idx];
      if (showRecentBlock) {
        if (idx < recents.length) return recents[idx];
        return items[idx - recents.length];
      }
      return items[idx];
    },
    [items, query, recents, showRecentBlock],
  );

  const activate = useCallback(
    (idx: number) => {
      const item = resolveSelectableItem(idx);
      if (!item) return;
      setOpen(false);
      setQuery("");
      if (item.href) {
        persistRecent(item);
        router.push(item.href);
      } else {
        void item.action?.();
      }
    },
    [resolveSelectableItem, router],
  );

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => {
          if (v) {
            setQuery("");
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
      className="fixed inset-0 z-[70] flex justify-center bg-black/55 px-4 pt-[15vh]"
      role="presentation"
      onMouseDown={closePalette}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-label="Command palette"
        className="flex max-h-[min(420px,70vh)] w-full max-w-xl flex-col overflow-hidden rounded-card border border-border-default bg-bg-panel shadow-elevated outline-none"
        onMouseDown={(ev) => ev.stopPropagation()}
      >
        <div className="border-b border-border-subtle px-4 py-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-fg-faint">
            Jump or run
          </p>
          <input
            ref={inputRef}
            type="search"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search routes…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKeyDown}
            className="mt-2 w-full rounded-md border border-border-default bg-bg-base px-3 py-2 text-sm text-fg-primary outline-none ring-accent-blue focus:ring-2"
          />
          <p className="mt-2 text-[11px] text-fg-faint">
            <kbd className="rounded border border-border-default px-1 font-mono text-[10px]">⌘</kbd>{" "}
            <kbd className="rounded border border-border-default px-1 font-mono text-[10px]">K</kbd>{" "}
            toggle · arrows navigate · enter opens
          </p>
        </div>
        <ul className="flex-1 overflow-y-auto p-2" role="listbox">
          {showRecentBlock ? (
            <>
              <li>
                <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-faint">
                  Recent
                </p>
              </li>
              {recents.map((item, idx) => (
                <li key={`recent-${item.id}`} role="option" aria-selected={idx === safeActive}>
                  <button
                    type="button"
                    className={`flex w-full flex-col items-start rounded-md px-3 py-2 text-left text-sm transition-colors ${
                      idx === safeActive ? "bg-accent-blue-soft text-fg-primary" : "text-fg-muted hover:bg-bg-elevated"
                    }`}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => activate(idx)}
                  >
                    <span className="font-medium text-fg-primary">{item.label}</span>
                    {item.hint ? (
                      <span className="mt-0.5 text-xs text-fg-faint">{item.hint}</span>
                    ) : null}
                  </button>
                </li>
              ))}
              <li>
                <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-faint">
                  All
                </p>
              </li>
            </>
          ) : null}
          {items.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-fg-muted">No matches</li>
          ) : (
            items.map((item, idx) => {
              const listIdx = showRecentBlock ? idx + recents.length : idx;
              return (
                <li key={item.id} role="option" aria-selected={listIdx === safeActive}>
                  <button
                    type="button"
                    className={`flex w-full flex-col items-start rounded-md px-3 py-2 text-left text-sm transition-colors ${
                      listIdx === safeActive ? "bg-accent-blue-soft text-fg-primary" : "text-fg-muted hover:bg-bg-elevated"
                    }`}
                    onMouseEnter={() => setActive(listIdx)}
                    onClick={() => activate(listIdx)}
                  >
                    <span className="font-medium text-fg-primary">{item.label}</span>
                    {item.hint ? (
                      <span className="mt-0.5 text-xs text-fg-faint">{item.hint}</span>
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
