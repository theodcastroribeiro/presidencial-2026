import test from "node:test";
import assert from "node:assert/strict";
import { bearerAuthorized, preserveSnapshot, readPreservedSnapshot } from "../lib/public-snapshot.mjs";
import { collectOnce, runCollector, DEFAULT_SITE_URL } from "../scripts/collect-public.mjs";

const FICTIONAL_TOKEN = "fictional-test-only-not-a-real-credential";
function snapshot() {
  const scope = { code: "BR", official: true, stale: false, validVotes: 1000, lulaVotes: 510,
    bolsonaroVotes: 490, sourceUpdatedAt: "2026-10-25T17:01:00-03:00" };
  const projection = { available: true, status: "available", lulaPercent: 51, bolsonaroPercent: 49,
    validVotes: 10000, states: [{ code: "SP", remainingValidVotes: 9000 }] };
  return { election: { id: "6258", year: 2026, round: 2 }, source: { official: true, live: true },
    fetchedAt: "2026-10-25T20:01:10Z", national: scope, states: [{ ...scope, code: "SP" }],
    overseas: { ...scope, code: "ZZ" }, regions: [{ ...scope, code: "sudeste", official: false }],
    projection, projections: { combined: projection, historical2022: projection, firstRound2026: projection }, errors: [] };
}
function success(overrides = {}) {
  return { ok: true, fresh: true, coverage: { fresh: 29, expected: 29 },
    persistence: { stored: true, reason: "stored" }, readback: { verified: true },
    sourceUpdatedAt: "2026-10-25T17:01:00-03:00", ...overrides };
}

test("collector authorization accepts only the matching bearer without exposing it", async () => {
  const request = (header) => new Request(DEFAULT_SITE_URL, { headers: header ? { Authorization: header } : {} });
  assert.equal(await bearerAuthorized(request(`Bearer ${FICTIONAL_TOKEN}`), FICTIONAL_TOKEN), true);
  assert.equal(await bearerAuthorized(request(`bearer ${FICTIONAL_TOKEN}`), FICTIONAL_TOKEN), true);
  assert.equal(await bearerAuthorized(request(`Bearer ${FICTIONAL_TOKEN}x`), FICTIONAL_TOKEN), false);
  assert.equal(await bearerAuthorized(request(`Basic ${FICTIONAL_TOKEN}`), FICTIONAL_TOKEN), false);
  assert.equal(await bearerAuthorized(request(null), FICTIONAL_TOKEN), false);
  assert.equal(await bearerAuthorized(request(`Bearer ${FICTIONAL_TOKEN}`), undefined), false);
});

test("recovered snapshots preserve official counts and timestamps but suspend every projection", () => {
  const input = snapshot();
  const preserved = preserveSnapshot(input);
  assert.equal(preserved.source.live, false);
  assert.equal(preserved.source.preserved, true);
  assert.equal(preserved.fetchedAt, input.fetchedAt);
  assert.equal(preserved.national.sourceUpdatedAt, input.national.sourceUpdatedAt);
  assert.equal(preserved.national.lulaVotes, 510);
  assert.ok([preserved.national, ...preserved.states, preserved.overseas, ...preserved.regions].every((scope) => scope.stale && scope.preserved));
  for (const projection of [preserved.projection, ...Object.values(preserved.projections)]) {
    assert.equal(projection.available, false);
    assert.equal(projection.status, "limited");
    assert.equal(projection.lulaPercent, null);
    assert.equal(projection.states[0].remainingValidVotes, null);
  }
  assert.equal(input.source.live, true);
  assert.equal(input.projection.available, true);
  assert.equal(preserveSnapshot({ ...input, election: { id: "544" } }), null);
});

test("R2 recovery skips a partial snapshot and never writes", async () => {
  let writes = 0;
  const original = snapshot();
  const bucket = {
    list: async ({ limit }) => { assert.equal(limit, 5); return { objects: [{ key: "partial" }, { key: "valid" }] }; },
    get: async (key) => ({ json: async () => ({ snapshot: key === "partial" ? { ...original, national: null } : original }) }),
    put: async () => { writes++; },
  };
  const preserved = await readPreservedSnapshot(bucket);
  assert.equal(preserved.national.lulaVotes, 510);
  assert.equal(writes, 0);
  assert.equal(await readPreservedSnapshot(undefined), null);
  assert.equal(await readPreservedSnapshot({ list: async () => { throw new Error("fictional failure"); } }), null);
});

test("unchanged official generation is successful after fresh source validation and readback", async () => {
  const result = await collectOnce({ token: FICTIONAL_TOKEN, fetcher: async (url, options) => {
    assert.equal(url, `${DEFAULT_SITE_URL}/api/refresh`);
    assert.equal(options.method, "POST");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, `Bearer ${FICTIONAL_TOKEN}`);
    return Response.json(success({ persistence: { stored: false, reason: "already-recorded" } }));
  } });
  assert.equal(result.ok, true);
  assert.equal(result.reason, "already-recorded");
});

test("HTTP 200 alone, missing readback, incomplete coverage, and failed authentication do not pass", async () => {
  for (const data of [{ ok: true }, success({ readback: { verified: false } }), success({ coverage: { fresh: 28, expected: 29 } })]) {
    const result = await collectOnce({ token: FICTIONAL_TOKEN, fetcher: async () => Response.json(data) });
    assert.equal(result.ok, false);
  }
  const unauthorized = await collectOnce({ token: FICTIONAL_TOKEN, fetcher: async () => new Response("unauthorized", { status: 401 }) });
  assert.equal(unauthorized.retryable, false);
  assert.equal(unauthorized.ok, false);
  assert.equal((await collectOnce({ token: undefined })).retryable, false);
  await assert.rejects(collectOnce({ token: FICTIONAL_TOKEN, baseUrl: "https://example.com", fetcher: async () => { throw new Error("must not be called"); } }), /invalid-collector-origin/);
});

test("single collection retries at most three times with short backoff and redacted logs", async () => {
  let attempts = 0;
  const sleeps = [], logs = [];
  const result = await runCollector({ token: "2026-10-25", fetcher: async () => {
    attempts++;
    return attempts < 3 ? new Response("fictional failure", { status: 503 }) : Response.json(success());
  }, sleep: async (ms) => { sleeps.push(ms); }, log: (message) => logs.push(message) });
  assert.equal(result.ok, true);
  assert.equal(attempts, 3);
  assert.deepEqual(sleeps, [2000, 5000]);
  assert.ok(logs.every((message) => !message.includes("2026-10-25")));
  assert.ok(logs.some((message) => message.includes("[REDACTED]")));
});

test("continuous mode makes sequential minute-spaced calls and respects its finite window", async () => {
  let clock = 0, calls = 0, active = 0, maxActive = 0;
  const times = [];
  const result = await runCollector({ token: FICTIONAL_TOKEN, continuous: true, minutes: 3,
    now: () => clock, sleep: async (ms) => { clock += ms; }, log: () => {},
    fetcher: async () => { active++; maxActive = Math.max(maxActive, active); calls++; times.push(clock); active--; return Response.json(success()); },
  });
  assert.equal(result.ok, true);
  assert.equal(calls, 3);
  assert.equal(maxActive, 1);
  assert.deepEqual(times, [0, 60000, 120000]);
  assert.equal(clock, 180000);
});

test("non-retryable authorization failure stops a continuous run immediately", async () => {
  let calls = 0;
  const result = await runCollector({ token: FICTIONAL_TOKEN, continuous: true, minutes: 330,
    fetcher: async () => { calls++; return new Response("unauthorized", { status: 403 }); },
    sleep: async () => { throw new Error("must not sleep"); }, log: () => {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.cycles, 1);
  assert.equal(calls, 1);
});
