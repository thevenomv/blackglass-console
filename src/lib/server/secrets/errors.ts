export class SecretFetchError extends Error {
  readonly code = "secret_fetch_error" as const;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SecretFetchError";
  }
}
