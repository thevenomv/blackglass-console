/**
 * Browser helper: POST /api/v1/baselines returns 202 + job id when Postgres is
 * configured; poll capture-jobs until the job completes (avoids Cloudflare
 * origin timeouts on long SSH capture).
 */

export type BaselineCaptureClientResult =
  | { ok: true; captured: number; failed: number }
  | { ok: false; detail: string };

const POLL_MS = 2000;
const MAX_POLLS = 120;

export async function runBaselineCaptureFromBrowser(): Promise<BaselineCaptureClientResult> {
  const post = await fetch("/api/v1/baselines", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: "{}",
  });

  const postBody = (await post.json().catch(() => ({}))) as Record<string, unknown>;

  if (post.status === 503 && postBody.error === "collector_not_configured") {
    return { ok: false, detail: String(postBody.detail ?? "Collector is not configured.") };
  }

  if (post.status === 202) {
    const jobId = typeof postBody.job_id === "string" ? postBody.job_id : null;
    if (!jobId) return { ok: false, detail: "Server returned 202 without job_id." };

    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      const jr = await fetch(`/api/v1/baselines/capture-jobs/${jobId}`, {
        headers: { Accept: "application/json" },
      });
      const j = (await jr.json().catch(() => ({}))) as {
        status?: string;
        error?: string;
        error_detail?: string;
        detail?: string;
        captured?: unknown[];
        failed?: unknown[];
      };

      if (!jr.ok) {
        return {
          ok: false,
          detail: String(
            j.detail ??
              j.error_detail ??
              j.error ??
              `Job poll failed (HTTP ${jr.status}).`,
          ),
        };
      }

      if (j.status === "succeeded") {
        return {
          ok: true,
          captured: Array.isArray(j.captured) ? j.captured.length : 0,
          failed: Array.isArray(j.failed) ? j.failed.length : 0,
        };
      }
      if (j.status === "failed") {
        return { ok: false, detail: j.error_detail ?? "Baseline capture failed." };
      }
    }

    return {
      ok: false,
      detail:
        "Baseline capture is still running after several minutes. Open Baselines — it may finish in the background.",
    };
  }

  if (!post.ok) {
    return {
      ok: false,
      detail: String(
        postBody.detail ?? postBody.error ?? `Baseline capture failed (HTTP ${post.status}).`,
      ),
    };
  }

  const captured = Array.isArray(postBody.captured) ? postBody.captured : [];
  const failed = Array.isArray(postBody.failed) ? postBody.failed : [];
  return { ok: true, captured: captured.length, failed: failed.length };
}
