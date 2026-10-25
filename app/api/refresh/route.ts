import { env } from "cloudflare:workers";
import { fetchElectionSnapshot, SCOPES } from "@/lib/election.mjs";
import baseline from "@/public/data/baseline-2022.json";
import historical2022 from "@/public/data/historico-2022-uf.json";
import firstRound2026 from "@/public/data/first-round-2026.json";
import { recordSnapshot } from "@/lib/snapshot-store";
import { bearerAuthorized } from "@/lib/public-snapshot.mjs";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (!env.COLLECTOR_TOKEN || !env.BUCKET) return Response.json({ ok: false, error: "collector-not-configured" }, { status: 503, headers });
  if (!await bearerAuthorized(request, env.COLLECTOR_TOKEN)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401, headers: { ...headers, "WWW-Authenticate": "Bearer" } });
  }
  const startedAt = Date.now();
  try {
    const snapshot = await fetchElectionSnapshot({ force: true, baseline, references: {
      historical2022: { baseline, history: historical2022 }, firstRound2026: { baseline: firstRound2026, history: null },
    } });
    const scopes = [snapshot.national, ...snapshot.states, snapshot.overseas].filter(Boolean);
    const codes = new Set(scopes.map((scope) => scope.code));
    const stale = scopes.filter((scope) => scope.stale).map((scope) => scope.code);
    const missing = SCOPES.filter((code) => !codes.has(code));
    const refreshed = scopes.filter((scope) => !scope.stale && Number.isFinite(Date.parse(scope.sourceFetchedAt))
      && Date.parse(scope.sourceFetchedAt) >= startedAt - 120_000);
    const coverage = { received: scopes.length, fresh: refreshed.length, expected: SCOPES.length, stale, missing };
    const fresh = Boolean(snapshot.national && !snapshot.national.stale && snapshot.source.official
      && snapshot.source.live && refreshed.length === SCOPES.length);
    const persistence = await recordSnapshot(env.BUCKET, snapshot);
    let readback = { verified: false, recordedAt: null as string | null };
    if (persistence.key && (persistence.stored || persistence.reason === "already-recorded")) {
      const object = await env.BUCKET.get(persistence.key);
      if (object) {
        const saved = await object.json<{ fingerprint?: string; recordedAt?: string; snapshot?: { election?: { id?: string }; source?: { official?: boolean } } }>();
        readback = { verified: saved.snapshot?.election?.id === "6258" && saved.snapshot.source?.official === true
          && persistence.key.endsWith(`-${saved.fingerprint}.json`), recordedAt: saved.recordedAt || null };
      }
    }
    const ok = fresh && readback.verified;
    return Response.json({ ok, checkedAt: new Date().toISOString(), fetchedAt: snapshot.fetchedAt,
      sourceUpdatedAt: snapshot.national?.sourceUpdatedAt || null, fresh, coverage,
      persistence: { stored: persistence.stored, reason: persistence.reason || "stored" }, readback,
      ...(ok ? {} : { error: !fresh ? "incomplete-fresh-source" : "persistence-readback-failed" }),
    }, { status: ok ? 200 : 503, headers });
  } catch {
    return Response.json({ ok: false, error: "collection-failed", checkedAt: new Date().toISOString() }, { status: 503, headers });
  }
}
