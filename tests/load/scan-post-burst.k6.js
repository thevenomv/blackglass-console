/**
 * k6 burst against POST /api/v1/scans (expects 429 once token bucket fills).
 *
 * Install k6: https://k6.io/docs/get-started/installation/
 *
 *   k6 run -e BASE_URL=http://127.0.0.1:3100 tests/load/scan-post-burst.k6.js
 */
import http from "k6/http";
import { check, sleep } from "k6";

const base = (__ENV.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");

export const options = {
  vus: 1,
  iterations: 60,
};

export default function burstScans() {
  const res = http.post(
    `${base}/api/v1/scans`,
    JSON.stringify({ host_ids: [] }),
    { headers: { "Content-Type": "application/json", Accept: "application/json" } },
  );
  check(res, { "200 or 429": (r) => r.status === 200 || r.status === 429 });
  sleep(0.05);
}
