/**
 * Strip obvious secrets from Charon error strings before persisting or returning to clients.
 */

export function redactSensitivePlaintext(input: string, maxLen = 4000): string {
  let s = input.length > maxLen ? input.slice(0, maxLen) : input;

  s = s.replace(/\bAKIA[0-9A-Z]{16}\b/g, "AKIA…REDACTED");
  s = s.replace(/\b(ASIA|AROA|AIDA)[A-Z0-9]{16,}\b/g, "…REDACTED_KEY_ID");
  s = s.replace(/-----BEGIN[\s\S]*?-----END[^-\n]*-----/g, "[redacted:pem]");
  s = s.replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]");
  s = s.replace(/\bya29\.[A-Za-z0-9._-]+\b/g, "ya29.[redacted]");
  s = s.replace(/sk_(live|test)_[A-Za-z0-9]{8,}/gi, "sk_[redacted]");
  s = s.replace(/xox[baprs]-[A-Za-z0-9-]{10,}/g, "xox…[redacted]");
  s = s.replace(/dp\.st\.[A-Za-z0-9._-]{6,}/gi, "dp.st.[redacted]");
  s = s.replace(/Authorization:\s*[^\s]+\s+[^\s"']+/gi, "Authorization: [redacted]");

  return s;
}
