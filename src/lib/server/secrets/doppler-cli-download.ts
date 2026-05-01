import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { SecretFetchError } from "./errors";

const execFileAsync = promisify(execFile);

/** `doppler secrets download` JSON using the CLI token + cwd-scoped project (local dev). */
export async function loadDopplerSecretsJsonViaCli(cwd?: string): Promise<unknown> {
  const dir = cwd ?? process.cwd();
  try {
    const { stdout } = await execFileAsync(
      "doppler",
      ["secrets", "download", "--no-file", "--format", "json"],
      {
        cwd: dir,
        maxBuffer: 25_000_000,
        windowsHide: true,
      },
    );
    return JSON.parse(String(stdout));
  } catch (e) {
    const hint =
      "Install the Doppler CLI, run `doppler login` / `doppler setup` in this repo, " +
      "or set DOPPLER_TOKEN for API-based fetch (e.g. App Platform).";
    if (e && typeof e === "object" && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT") {
      throw new SecretFetchError(`Doppler CLI not found. ${hint}`, { cause: e });
    }
    throw new SecretFetchError(`Doppler CLI secrets download failed. ${hint}`, { cause: e });
  }
}

/** Check CLI auth (no token in env), for health probe. */
export async function dopplerMeViaCli(cwd?: string): Promise<void> {
  const dir = cwd ?? process.cwd();
  try {
    await execFileAsync("doppler", ["me", "--json"], {
      cwd: dir,
      maxBuffer: 2_000_000,
      windowsHide: true,
    });
  } catch (e) {
    const hint =
      "Run `doppler login` and `doppler setup` in this repo, or set DOPPLER_TOKEN for API probes.";
    if (e && typeof e === "object" && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT") {
      throw new SecretFetchError(`Doppler CLI not found. ${hint}`, { cause: e });
    }
    throw new SecretFetchError(`Doppler CLI me failed. ${hint}`, { cause: e });
  }
}
