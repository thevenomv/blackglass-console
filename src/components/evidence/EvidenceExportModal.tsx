"use client";

import { Button } from "@/components/ui/Button";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { useCallback, useId, useState } from "react";

type OutputFormat = "json" | "pdf" | "markdown_bundle";

export function EvidenceExportModal({
  triggerLabel = "New export",
}: {
  triggerLabel?: string;
}) {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [format, setFormat] = useState<OutputFormat>("markdown_bundle");

  const handleEscape = useCallback(() => {
    if (!loading) setOpen(false);
  }, [loading]);

  const trapRef = useFocusTrap(open, handleEscape);

  const generate = () => {
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      setOpen(false);
    }, 900);
  };

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 p-4"
          role="presentation"
          onClick={() => !loading && setOpen(false)}
        >
          <div
            ref={trapRef}
            role="dialog"
            aria-labelledby={`${formId}-export-title`}
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card border border-border-default bg-bg-panel shadow-elevated"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="border-b border-border-subtle px-6 py-5">
              <h2 id={`${formId}-export-title`} className="text-lg font-semibold text-fg-primary">
                Evidence bundle export
              </h2>
              <p className="mt-1 text-sm text-fg-muted">
                Configure scope, output format, and included artifacts for auditors or incident
                review.
              </p>
            </header>

            <div className="space-y-5 px-6 py-5">
              <fieldset className="space-y-2">
                <legend className="text-xs font-medium uppercase tracking-wide text-fg-faint">
                  Output type
                </legend>
                <label className="flex items-center gap-2 text-sm text-fg-muted">
                  <input
                    type="radio"
                    name={`${formId}-fmt`}
                    checked={format === "json"}
                    onChange={() => setFormat("json")}
                    className="accent-[var(--accent-blue)]"
                  />
                  Structured findings (JSON)
                </label>
                <label className="flex items-center gap-2 text-sm text-fg-muted">
                  <input
                    type="radio"
                    name={`${formId}-fmt`}
                    checked={format === "pdf"}
                    onChange={() => setFormat("pdf")}
                    className="accent-[var(--accent-blue)]"
                  />
                  Executive PDF
                </label>
                <label className="flex items-center gap-2 text-sm text-fg-muted">
                  <input
                    type="radio"
                    name={`${formId}-fmt`}
                    checked={format === "markdown_bundle"}
                    onChange={() => setFormat("markdown_bundle")}
                    className="accent-[var(--accent-blue)]"
                  />
                  Markdown report bundle (ZIP)
                </label>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-xs font-medium uppercase tracking-wide text-fg-faint">
                  Scope
                </legend>
                <label className="flex items-center gap-2 text-sm text-fg-muted">
                  <input
                    type="radio"
                    name={`${formId}-scope`}
                    defaultChecked
                    className="accent-[var(--accent-blue)]"
                  />
                  Single host (contextual selection)
                </label>
                <label className="flex items-center gap-2 text-sm text-fg-muted">
                  <input type="radio" name={`${formId}-scope`} className="accent-[var(--accent-blue)]" />
                  Fleet — production tag
                </label>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-xs font-medium uppercase tracking-wide text-fg-faint">
                  Included artifacts
                </legend>
                <label className="flex items-center gap-2 text-sm text-fg-muted">
                  <input type="checkbox" defaultChecked className="accent-[var(--accent-blue)]" />
                  Collector metadata (versions, scan profile)
                </label>
                <label className="flex items-center gap-2 text-sm text-fg-muted">
                  <input type="checkbox" defaultChecked className="accent-[var(--accent-blue)]" />
                  Host summary facts (OS, kernel, baseline label)
                </label>
                <label className="flex items-center gap-2 text-sm text-fg-muted">
                  <input type="checkbox" defaultChecked className="accent-[var(--accent-blue)]" />
                  Drift timeline for window
                </label>
                <label className="flex items-center gap-2 text-sm text-fg-muted">
                  <input type="checkbox" className="accent-[var(--accent-blue)]" />
                  Referenced config excerpts (bounded size)
                </label>
              </fieldset>

              <div className="space-y-1">
                <label htmlFor={`${formId}-case`} className="text-xs text-fg-faint">
                  Case ID (optional)
                </label>
                <input
                  id={`${formId}-case`}
                  className="w-full rounded-card border border-border-default bg-bg-base px-3 py-2 font-mono text-sm text-fg-primary outline-none ring-accent-blue focus:ring-2"
                  placeholder="INC-2047"
                />
              </div>
            </div>

            <footer className="flex justify-end gap-2 border-t border-border-subtle px-6 py-4">
              <Button
                variant="secondary"
                type="button"
                disabled={loading}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="button" disabled={loading} onClick={generate}>
                {loading ? "Packaging…" : "Generate export"}
              </Button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
