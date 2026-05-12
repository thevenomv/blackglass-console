# Internal documentation (operators & engineers)

Markdown in this directory is **not** part of the customer-facing product. It is meant for **operators**, **security reviewers**, and **engineers** with repo or private runbook access.

- **Stakeholder review packet:** Cursor Canvas **Project overview** — `project-overview.canvas.tsx` in the workspace `canvases/` directory (IDE-managed; open from the Canvas panel).

- Do **not** link these files from marketing pages, the in-app console for end users, or public footers.
- Customer-facing education lives under `src/app/guides/`, `src/app/use-cases/`, `/security`, `/privacy`, and similar routes, and should avoid exposing repository paths or internal runbook filenames.
- **Local Postgres/Redis (Docker):** [local-dev-docker.md](local-dev-docker.md) — operator quick path for a disposable data plane on a laptop.
- **Apollo cold email sequences (internal sales):** [sales/apollo-cold-email-sequences.md](sales/apollo-cold-email-sequences.md) — paste-ready touches; send via Apollo mailboxes, not Resend product mail.
