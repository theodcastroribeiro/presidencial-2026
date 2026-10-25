#!/usr/bin/env node
import { pathToFileURL } from "node:url";

export const DEFAULT_SITE_URL = "https://presidencial-2026-publico.theodcastroribeiro.chatgpt.site";
const ATTEMPTS = 3, INTERVAL_MS = 60_000, MAX_MINUTES = 330;

function collectorUrl(baseUrl) {
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" || url.origin !== DEFAULT_SITE_URL || url.username || url.password) throw new Error("invalid-collector-origin");
  return new URL("/api/refresh", url.origin).href;
}
function safeLog(log, token, message) {
  const text = JSON.stringify({ at: new Date().toISOString(), ...message });
  log(token ? text.split(token).join("[REDACTED]") : text);
}
export async function collectOnce({ token, baseUrl = DEFAULT_SITE_URL, fetcher = fetch, signal } = {}) {
  if (typeof token !== "string" || !token || /\s/.test(token)) return { ok: false, retryable: false, error: "missing-or-invalid-collector-secret" };
  const url = collectorUrl(baseUrl);
  try {
    const response = await fetcher(url, { method: "POST", redirect: "error", cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(80_000)]) : AbortSignal.timeout(80_000),
    });
    if (response.status === 401 || response.status === 403) return { ok: false, retryable: false, status: response.status, error: "collector-authorization-failed" };
    if (!response.ok) return { ok: false, retryable: true, status: response.status, error: "collector-http-failed" };
    const data = await response.json();
    const accepted = data.persistence?.stored === true || data.persistence?.reason === "already-recorded";
    const ok = data.ok === true && data.fresh === true && data.coverage?.fresh === 29
      && data.coverage?.expected === 29 && data.readback?.verified === true && accepted;
    return { ok, retryable: !ok, status: response.status, error: ok ? undefined : "collector-validation-failed",
      fresh: data.fresh === true, received: Number.isInteger(data.coverage?.fresh) ? data.coverage.fresh : null,
      expected: 29, stored: data.persistence?.stored === true,
      reason: data.persistence?.reason === "already-recorded" ? "already-recorded" : data.persistence?.stored ? "stored" : "not-stored",
      sourceUpdatedAt: typeof data.sourceUpdatedAt === "string" && Number.isFinite(Date.parse(data.sourceUpdatedAt)) ? data.sourceUpdatedAt : null,
    };
  } catch {
    return { ok: false, retryable: !signal?.aborted, error: signal?.aborted ? "collector-stopped" : "collector-request-failed" };
  }
}
export async function runCollector({ token, baseUrl = DEFAULT_SITE_URL, continuous = false, minutes = MAX_MINUTES,
  fetcher = fetch, signal, log = console.log, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = Date.now,
} = {}) {
  const duration = Math.max(1, Math.min(MAX_MINUTES, minutes)) * 60_000;
  const deadline = now() + duration;
  let cycles = 0, failedCycles = 0, consecutiveFailures = 0;
  do {
    const cycleStart = now();
    let result;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      if (signal?.aborted) break;
      result = await collectOnce({ token, baseUrl, fetcher, signal });
      if (result.ok || !result.retryable || attempt === ATTEMPTS) break;
      safeLog(log, token, { event: "retry", attempt, error: result.error, status: result.status || null });
      await sleep(attempt === 1 ? 2_000 : 5_000);
    }
    if (!result || signal?.aborted) break;
    cycles++;
    if (result.ok) consecutiveFailures = 0;
    else { failedCycles++; consecutiveFailures++; }
    safeLog(log, token, { event: "collection", ...result });
    if (!continuous || (!result.retryable && !result.ok) || now() >= deadline) break;
    const remaining = Math.min(Math.max(0, cycleStart + INTERVAL_MS - now()), Math.max(0, deadline - now()));
    if (remaining) await sleep(remaining);
  } while (!signal?.aborted && now() < deadline);
  const summary = { ok: cycles > 0 && consecutiveFailures === 0, cycles, failedCycles, stopped: Boolean(signal?.aborted) };
  safeLog(log, token, { event: "finished", ...summary });
  return summary;
}
async function main() {
  if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("Node.js 24 required");
  const args = process.argv.slice(2);
  if (args.some((value, index) => !["--continuous", "--minutes"].includes(value) && args[index - 1] !== "--minutes")) throw new Error("invalid-collector-arguments");
  const minuteIndex = args.indexOf("--minutes");
  const minutes = minuteIndex === -1 ? MAX_MINUTES : Number(args[minuteIndex + 1]);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES) throw new Error("minutes-must-be-between-1-and-330");
  const controller = new AbortController();
  process.once("SIGTERM", () => controller.abort());
  process.once("SIGINT", () => controller.abort());
  const result = await runCollector({ token: process.env.PUBLIC_COLLECTOR_TOKEN,
    baseUrl: process.env.PUBLIC_SITE_URL || DEFAULT_SITE_URL, continuous: args.includes("--continuous"), minutes, signal: controller.signal });
  process.exitCode = result.ok ? 0 : 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error("Collector configuration or runtime failed; no credential was logged."); process.exitCode = 1; });
}
