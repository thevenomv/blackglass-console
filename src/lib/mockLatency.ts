/** Artificial delay for demonstrating loading states (remove when wiring APIs). */
export function mockLatency(ms = 320) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
