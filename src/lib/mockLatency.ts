/** Artificial delay for demonstrating loading states.
 * Bypassed immediately when NEXT_PUBLIC_USE_MOCK=false (production / live API mode). */
export function mockLatency(ms = 320) {
  if (process.env.NEXT_PUBLIC_USE_MOCK !== "true") return Promise.resolve();
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
