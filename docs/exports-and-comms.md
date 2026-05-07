# Exports & communications (branding notes)

## Report / evidence exports

- The UI ships **Markdown** and **PDF** outputs (`ReportsView`, `EvidenceExportModal`). PDFs are rendered with `pdf-lib` server-side; failed generations expose a structured JSON error and a `POST /api/v1/reports/:id/regenerate` retry endpoint.
- Use **light** typography (dark text on white/off-white) for PDFs so they match the default product shell and photocopy cleanly.
- Avoid embedding console dark-theme screenshots in customer-facing PDFs unless the document is explicitly branded for dark mode.

## Transactional email (invites, billing, alerts)

- When you add senders (Resend, SES, etc.), template header/footer colors should align with **`--bg-base` / `--text-primary`** light tokens (`#f1f5f9` / `#0f172a`) and primary **`#2563eb`** for links.
- Test messages in Gmail + Outlook light mode; avoid relying on `@media (prefers-color-scheme: dark)` in HTML email.

## Stripe / hosted checkout

- Checkout is hosted by Stripe; keep **`success_url` / `cancel_url`** on your domain so return pages stay on-brand (`globals.css` tokens).
