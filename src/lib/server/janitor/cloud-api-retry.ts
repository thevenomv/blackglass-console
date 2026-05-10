/**
 * Small backoff helpers for cloud list/delete calls (429 / throttling).
 */

export function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function isRetryableAwsSdkError(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  const name = e?.name ?? "";
  if (
    name === "Throttling" ||
    name === "ThrottlingException" ||
    name === "RequestLimitExceeded" ||
    name === "ServiceUnavailable" ||
    name === "SlowDown"
  ) {
    return true;
  }
  const code = e?.$metadata?.httpStatusCode;
  return code === 429 || code === 503;
}

export async function withAwsRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < maxAttempts - 1 && isRetryableAwsSdkError(e)) {
        await sleepMs(200 * 2 ** i);
        continue;
      }
      throw e;
    }
  }
  throw last;
}

export async function fetchWithCloudRetry(
  input: string | URL,
  init: RequestInit,
  maxAttempts = 4,
): Promise<Response> {
  let last!: Response;
  for (let i = 0; i < maxAttempts; i++) {
    last = await fetch(input, init);
    if (last.status !== 429 && last.status !== 503) return last;
    if (i < maxAttempts - 1) await sleepMs(250 * 2 ** i);
  }
  return last;
}
