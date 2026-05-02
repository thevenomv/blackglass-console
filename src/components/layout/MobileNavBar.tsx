"use client";

export function MobileNavBar({ onOpenNav }: { onOpenNav: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex shrink-0 items-center gap-3 border-b border-border-default bg-bg-panel px-4 py-3 lg:hidden">
      <button
        type="button"
        onClick={onOpenNav}
        aria-label="Open navigation menu"
        aria-expanded={false}
        className="rounded-card border border-border-default bg-bg-panel px-3 py-2 text-sm font-medium text-fg-primary hover:bg-bg-elevated"
      >
        Menu
      </button>
      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-faint">
        BLACKGLASS <span className="ml-1 font-mono text-[9px] font-normal tracking-wide text-fg-faint">by Obsidian Dynamics</span>
      </span>
      <span className="ml-auto text-[11px] text-fg-faint">
        <kbd className="rounded border border-border-subtle px-1 font-mono text-[10px]">⌘K</kbd>
      </span>
    </header>
  );
}
