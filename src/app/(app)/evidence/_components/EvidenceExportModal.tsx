"use client";

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { useCallback, useId, useState } from "react";

export function EvidenceExportModal({
  triggerLabel = "New export",
  onGenerated,
}: {
  triggerLabel?: string;
  onGenerated?: () => void;
}) {
  const formId = useId();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState("all");
  const [notes, setNotes] = useState("");

  const handleEscape = useCallback(() => {
    if (!loading) setOpen(false);
  }, [loading]);

  const trapRef = useFocusTrap(open, handleEscape);

  const handleClose = () => {
    if (loading) return;
    setOpen(false);
    setTitle("");
    setScope("all");
    setNotes("");
  };

  const generate = async () => {
    if (!title.trim()) {
      toast("Please enter a bundle title.", "warning");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/v1/evidence/bundles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), scope: scope.trim() || "all", notes: notes.trim() || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { detail?: string };
        toast(err.detail ?? "Failed to generate bundle.", "danger");
        return;
      }
      const data = await res.json() as { bundle?: { id: string } };
      toast("Bundle generated successfully.", "success");
      handleClose();
      onGenerated?.();
      if (data.bundle?.id) {
        const a = document.createElement("a");
        a.href = `/api/v1/evidence/bundles/${data.bundle.id}/file`;
        a.download = "";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch {
      toast("Network error — bundle generation failed.", "danger");
    } finally {
      setLoading(false);
    }
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
          onClick={handleClose}
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
                Generate evidence bundle
              </h2>
            </header>

            <div className="space-y-5 px-6 py-5">
              <div className="space-y-1">
                <label htmlFor={`${formId}-title`} className="text-xs font-medium text-fg-faint">
                  Bundle title <span className="text-red-400">*</span>
                </label>
                <input
                  id={`${formId}-title`}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  placeholder="e.g. SOC2-Q2-2026 or INC-2047-post-incident"
                  className="w-full rounded-card border border-border-default bg-bg-base px-3 py-2 text-sm text-fg-primary placeholder:text-fg-faint outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor={`${formId}-scope`} className="text-xs font-medium text-fg-faint">
                  Scope
                </label>
                <input
                  id={`${formId}-scope`}
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  maxLength={253}
                  placeholder="all  (or a specific host ID)"
                  className="w-full rounded-card border border-border-default bg-bg-base px-3 py-2 font-mono text-sm text-fg-primary placeholder:text-fg-faint outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue"
                />
                <p className="text-xs text-fg-faint">Leave as &ldquo;all&rdquo; to include all hosts, or enter a specific host ID.</p>
              </div>

              <div className="space-y-1">
                <label htmlFor={`${formId}-notes`} className="text-xs font-medium text-fg-faint">
                  Operator notes (optional)
                </label>
                <textarea
                  id={`${formId}-notes`}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={2000}
                  rows={3}
                  placeholder="Context for the auditor, incident reference, change ticket&hellip;"
                  className="w-full rounded-card border border-border-default bg-bg-base px-3 py-2 text-sm text-fg-primary placeholder:text-fg-faint outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue resize-none"
                />
              </div>
            </div>

            <footer className="flex justify-end gap-2 border-t border-border-subtle px-6 py-4">
              <Button variant="secondary" type="button" disabled={loading} onClick={handleClose}>
                Cancel
              </Button>
              <Button type="button" disabled={loading} onClick={() => void generate()}>
                {loading ? "Generating\u2026" : "Generate & download"}
              </Button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}