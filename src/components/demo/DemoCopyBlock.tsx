"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/Button";

type Props = {
  label: string;
  code: string;
  className?: string;
};

export function DemoCopyBlock({ label, code, className = "" }: Props) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code.trimEnd());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [code]);

  return (
    <div className={`rounded-card border border-border-default bg-bg-panel ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
        <p className="text-xs font-medium text-fg-primary">{label}</p>
        <Button type="button" variant="secondary" className="h-8 px-3 text-xs" onClick={() => void onCopy()}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="max-h-[min(24rem,50vh)] overflow-auto p-3 font-mono text-[11px] leading-relaxed text-fg-muted">
        {code.trimEnd()}
      </pre>
    </div>
  );
}
