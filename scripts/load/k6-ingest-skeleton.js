/**
 * k6 skeleton for POST /api/v1/ingest load characterization.
 * Install k6 separately: https://k6.io/docs/get-started/installation/
 *
 * Run (example):
 *   k6 run scripts/k6-ingest-skeleton.js
 */
import http from "k6/http";
import { check } from "k6";

export const options = {
  vus: 2,
  duration: "30s",
};

const url = __ENV.BASE_URL
  ? `${__ENV.BASE_URL.replace(/\/$/, "")}/api/v1/ingest`
  : "http://127.0.0.1:3000/api/v1/ingest";

export default function main() {
  const res = http.post(url, JSON.stringify({ hostId: "k6-synthetic", hostname: "k6" }), {
    headers: { "Content-Type": "application/json" },
  });
  check(res, {
    "status is 401 or 503": (r) => r.status === 401 || r.status === 503,
  });
}
