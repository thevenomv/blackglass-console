/**
 * SSH-based system telemetry collector.
 *
 * Hosts (always via env):
 *   COLLECTOR_HOST_1 … COLLECTOR_HOST_9 – targets (first gap stops the list)
 *   COLLECTOR_USER                       – SSH user (default: blackglass)
 *   COLLECTOR_HOST_N_USER / COLLECTOR_HOST_N_PORT   – per-host SSH user/port (optional)
 *
 * Credentials (JIT per scan via `SECRET_PROVIDER`):
 *   env        – `SSH_PRIVATE_KEY` (local / legacy)
 *   doppler    – `DOPPLER_PROJECT`, `DOPPLER_CONFIG` (and `DOPPLER_TOKEN` in prod / API fetch;
 *                local `doppler run` can use the CLI session instead of `DOPPLER_TOKEN`)
 *   infisical  – machine identity + project/env (see operator guide)
 *   vault      – Vault SSH sign engine (see operator guide)
 *
 * Optional: `BLACKGLASS_SSH_SECRET_NAME` – secret key name in Doppler/Infisical (default: SSH_PRIVATE_KEY)
 * Optional: `COLLECTOR_MAX_PARALLEL_SSH` – max concurrent SSH sessions per fleet collect (default 8, max 32)
 * Optional: `BLACKGLASS_LOG_COLLECTOR` – set `0` / `false` / `off` to disable one-line JSON collector logs
 *
 * Layout: `types.ts`, `parsers.ts`, `ssh.ts` (session), `gates.ts` (readiness), `collect.ts` (orchestration).
 * All collection happens server-side only; never import this in client code.
 */

export type {
  CollectScanOptions,
  ListeningPort,
  LocalUser,
  RunningService,
  SSHConfig,
  FirewallStatus,
  CronEntry,
  HostSnapshot,
} from "./types";

export {
  parseListeners,
  parseUsers,
  parseSudoers,
  parseSudoersFiles,
  parseCron,
  parseServices,
  parseSshConfig,
  parseFirewall,
} from "./parsers";

export { collectorConfigured, configuredHostCount } from "./gates";

export { collectSnapshot, collectAllSnapshots } from "./collect";
