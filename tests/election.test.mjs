import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTseResult, numberFromTse, tseTimestamp, aggregateRegion, projectElection, fetchElectionSnapshot, resetElectionCache, SCOPES, REGIONS } from "../lib/election.mjs";

function fixture(code = "PA", { processed = 0, lula = 0, bolsonaro = 0, total = 1000, final = false } = {}) {
  const votes = lula + bolsonaro;
  return { ele: "6258", t: "2", f: "o", cdabr: code.toLowerCase(), dg: "25/10/2026", hg: "17:12:34", idg: "123", tf: final ? "s" : "n", and: final ? "f" : processed ? "p" : "n",
    s: { ts: "100", st: String(processed / 10), snt: String(100 - processed / 10), pst: String(processed / 10).replace(".", ",") },
    e: { te: String(total), est: String(processed), esnt: String(total - processed), c: String(votes), pc: "80,00", a: "0", pa: "20,00" },
    v: { tv: String(votes), vv: String(votes), vb: "0", tvn: "0" },
    carg: [{ cd: "1", agr: [{ par: [{ sg: "PT", cand: [{ n: "13", nm: "LUIZ INÁCIO LULA DA SILVA", nmu: "LULA", vap: String(lula), pvap: votes ? String(lula / votes * 100).replace(".", ",") : "0,00", e: final && lula > bolsonaro ? "s" : "n" }] }, { sg: "PL", cand: [{ n: "22", nm: "FLAVIO NANTES BOLSONARO", nmu: "FLAVIO BOLSONARO", vap: String(bolsonaro), pvap: votes ? String(bolsonaro / votes * 100).replace(".", ",") : "0,00", e: final && bolsonaro > lula ? "s" : "n" }] }] }] }] };
}
const baseline = { states: [{ uf: "PA", electorate: 1000, validVotes: 800, lulaVotes: 480, bolsonaroVotes: 320 }, { uf: "AC", electorate: 1000, validVotes: 800, lulaVotes: 320, bolsonaroVotes: 480 }] };

test("parses Portuguese decimals and preserves unknown values", () => {
  assert.equal(numberFromTse("50,902400000"), 50.9024);
  assert.equal(numberFromTse("0"), 0);
  for (const value of [null, undefined, "", "-1", "NaN", "12x", "1.234,56"]) assert.equal(numberFromTse(value), null);
});
test("timestamps use explicit Brasilia UTC-03", () => {
  assert.equal(tseTimestamp("25/10/2026", "17:00:51"), "2026-10-25T17:00:51-03:00");
  assert.equal(tseTimestamp("", ""), null);
  assert.equal(tseTimestamp("31/02/2026", "17:00:00"), null);
  assert.equal(tseTimestamp("25/10/2026", "24:00:00"), null);
});
test("waiting result has no invented percentage or projection", () => {
  const state = normalizeTseResult(fixture(), "PA");
  assert.equal(state.status, "waiting");
  assert.equal(state.lulaPercent, null);
  assert.equal(state.attendancePercent, null);
  assert.equal(state.pendingElectorate, 1000);
  assert.equal(projectElection([state], baseline).available, false);
});
test("reads official percentage and 2026 candidate identity", () => {
  const raw = fixture("PA", { processed: 500, lula: 240, bolsonaro: 160 });
  raw.carg[0].agr[0].par.reverse();
  const state = normalizeTseResult(raw, "PA");
  assert.equal(state.lulaPercent, 60);
  assert.equal(state.bolsonaroPercent, 40);
  assert.equal(state.candidates.find(candidate => candidate.number === "22").name, "FLAVIO BOLSONARO");
  assert.equal(state.electorateProcessed, 500);
  assert.equal(state.sourceUpdatedAt, "2026-10-25T17:12:34-03:00");
});
test("rejects wrong election, scope, candidates, and unsafe/missing counts", () => {
  for (const mutate of [raw => raw.ele = "545", raw => raw.f = "s", raw => raw.cdabr = "sp", raw => raw.e.est = undefined, raw => raw.e.esnt = "600", raw => raw.v.vv = "9007199254740993", raw => raw.carg[0].agr[0].par[1].cand[0].nmu = "JAIR BOLSONARO"]) {
    const raw = fixture(); mutate(raw); assert.throws(() => normalizeTseResult(raw, "PA"));
  }
});
test("distinct destination counts surface a warning and suppress projection", () => {
  const raw = fixture("PA", { processed: 500, lula: 200, bolsonaro: 200 }); raw.v.vv = "390";
  const state = normalizeTseResult(raw, "PA");
  assert.equal(state.warnings.length, 1);
  assert.equal(projectElection([state], baseline).available, false);
});
test("regions aggregate counts rather than averaging percentages", () => {
  const small = normalizeTseResult(fixture("PA", { processed: 500, lula: 240, bolsonaro: 160 }), "PA");
  const big = normalizeTseResult(fixture("AC", { processed: 1000, lula: 200, bolsonaro: 600 }), "AC");
  const region = aggregateRegion([small, big], REGIONS[0]);
  assert.equal(region.lulaVotes, 440);
  assert.ok(Math.abs(region.lulaPercent - 36.6666666667) < 0.0001);
  assert.equal(region.official, false);
  assert.equal(region.coverage.complete, false);
  assert.ok(region.coverage.missing.includes("AM"));
});
test("stratified projection includes counted votes and separate pending geography", () => {
  const pa = normalizeTseResult(fixture("PA", { processed: 500, lula: 240, bolsonaro: 160 }), "PA");
  const ac = normalizeTseResult(fixture("AC"), "AC");
  const projection = projectElection([pa, ac], baseline, { expectedStates: 2 });
  assert.equal(projection.lulaVotes, 800);
  assert.equal(projection.bolsonaroVotes, 800);
  assert.equal(projection.lulaPercent, 50);
  assert.equal(projection.pendingValidVotes, 1200);
  assert.equal(projection.baselineStates, 1);
  assert.equal(projection.lowLulaPercent, 47.75);
  assert.equal(projection.highLulaPercent, 52.25);
});
test("stale UF is excluded and coverage remains visible", () => {
  const pa = normalizeTseResult(fixture("PA", { processed: 500, lula: 240, bolsonaro: 160 }), "PA");
  const ac = { ...normalizeTseResult(fixture("AC", { processed: 500, lula: 200, bolsonaro: 200 }), "AC"), stale: true };
  const projection = projectElection([pa, ac], baseline, { expectedStates: 2 });
  assert.equal(projection.status, "limited");
  assert.equal(projection.available, false);
  assert.equal(projection.lulaPercent, null);
  assert.equal(projection.pendingValidVotes, null);
  assert.equal(projection.coveragePercent, 50);
  assert.deepEqual(projection.excludedStates, ["AC"]);
});
test("scenario collapses to actual result when all votes are counted", () => {
  const pa = normalizeTseResult(fixture("PA", { processed: 1000, lula: 480, bolsonaro: 320, final: true }), "PA");
  const projection = projectElection([pa], baseline, { expectedStates: 1 });
  assert.equal(projection.status, "final");
  assert.equal(projection.lulaVotes, 480);
  assert.equal(projection.lowLulaPercent, 60);
  assert.equal(projection.highLulaPercent, 60);
});
test("fetches 29 fixed scopes, caches 55 seconds, and keeps BR authoritative", async () => {
  resetElectionCache(); let calls = 0;
  const fetcher = async url => { calls++; const code = /dados\/([a-z]+)\//.exec(url)[1].toUpperCase(); return new Response(JSON.stringify(fixture(code, { processed: 500, lula: 240, bolsonaro: 160 })), { headers: { ETag: '"one"' } }); };
  const snapshot = await fetchElectionSnapshot({ fetcher, baseline, now: Date.UTC(2026, 9, 25, 20) });
  assert.equal(calls, 29);
  assert.equal(snapshot.states.length, 27);
  assert.equal(snapshot.overseas.code, "ZZ");
  assert.equal(snapshot.national.validVotes, 400);
  assert.equal(snapshot.consistency.stateValidVotes, 400 * 28);
  const cached = await fetchElectionSnapshot({ fetcher, baseline, now: Date.UTC(2026, 9, 25, 20) + 54_000 });
  assert.equal(cached, snapshot); assert.equal(calls, 29);
  assert.deepEqual(snapshot.errors, []);
});
test("failed scope preserves explicitly stale data and does not masquerade as a live point", async () => {
  resetElectionCache(); const now = Date.UTC(2026, 9, 25, 20);
  let failing = false;
  const fetcher = async url => { const code = /dados\/([a-z]+)\//.exec(url)[1].toUpperCase(); if (failing && code === "PA") return new Response("", { status: 503 }); return new Response(JSON.stringify(fixture(code, { processed: 500, lula: 240, bolsonaro: 160 }))); };
  await fetchElectionSnapshot({ fetcher, baseline, now }); failing = true;
  const next = await fetchElectionSnapshot({ fetcher, baseline, now: now + 56_000 });
  assert.equal(next.errors[0].code, "PA");
  assert.equal(next.states.find(state => state.code === "PA").stale, true);
  assert.ok(next.projection.excludedStates.includes("PA"));
  assert.equal(next.coverage.fresh, 27);
});
test("all fixed endpoints are unique and constrained to official TSE", () => {
  assert.equal(SCOPES.length, 29); assert.equal(new Set(SCOPES).size, 29);
});
test("conditional 304 revalidates prior data without calling it stale", async () => {
  resetElectionCache(); const now = Date.UTC(2026, 9, 25, 20); let conditional = false;
  const fetcher = async (url, options) => {
    const code = /dados\/([a-z]+)\//.exec(url)[1].toUpperCase();
    if (conditional) { assert.equal(options.headers["If-None-Match"], '"v1"'); return new Response(null, { status: 304 }); }
    return new Response(JSON.stringify(fixture(code)), { headers: { ETag: '"v1"' } });
  };
  const first = await fetchElectionSnapshot({ fetcher, baseline, now }); conditional = true;
  const next = await fetchElectionSnapshot({ fetcher, baseline, now: now + 56_000 });
  assert.deepEqual(next.errors, []);
  assert.equal(next.national.stale, false);
  assert.equal(next.national.sourceUpdatedAt, first.national.sourceUpdatedAt);
  assert.equal(next.national.sourceFetchedAt, new Date(now + 56_000).toISOString());
});
test("missing first-load scope is unavailable rather than substituted with zero", async () => {
  resetElectionCache();
  const fetcher = async url => { const code = /dados\/([a-z]+)\//.exec(url)[1].toUpperCase(); return code === "PA" ? new Response("", { status: 503 }) : new Response(JSON.stringify(fixture(code))); };
  const next = await fetchElectionSnapshot({ fetcher, baseline });
  assert.equal(next.states.some(state => state.code === "PA"), false);
  assert.equal(next.states.length, 26);
  assert.ok(next.regions.find(region => region.code === "norte").coverage.missing.includes("PA"));
  assert.equal(next.national.electorate, 1000);
});
test("one UF cannot publish a national percentage even with a national electorate total", () => {
  const pa = normalizeTseResult(fixture("PA", { processed: 500, lula: 240, bolsonaro: 160 }), "PA");
  const projection = projectElection([pa], baseline, { totalElectorate: 28_000 });
  assert.equal(projection.status, "limited");
  assert.equal(projection.available, false);
  for (const field of ["lulaPercent", "bolsonaroPercent", "lulaVotes", "bolsonaroVotes", "validVotes", "pendingValidVotes", "lowLulaPercent", "highLulaPercent"]) assert.equal(projection[field], null);
  assert.deepEqual(projection.states, []);
});
test("full scope count with insufficient electorate coverage suspends projection", () => {
  const pa = normalizeTseResult(fixture("PA", { processed: 500, lula: 240, bolsonaro: 160 }), "PA");
  const projection = projectElection([pa], baseline, { expectedStates: 1, totalElectorate: 2000 });
  assert.equal(projection.coveragePercent, 50);
  assert.equal(projection.status, "limited");
  assert.equal(projection.available, false);
  assert.equal(projection.lulaPercent, null);
});
test("stale, warning-bearing, or missing required national result suspends all projection numbers", () => {
  const pa = normalizeTseResult(fixture("PA", { processed: 500, lula: 240, bolsonaro: 160 }), "PA");
  for (const national of [{ stale: true }, { stale: false, warnings: ["Contagens divergentes"] }, null]) {
    const projection = projectElection([pa], baseline, { expectedStates: 1, national, requireNational: true });
    assert.equal(projection.status, "limited");
    assert.equal(projection.available, false);
    assert.equal(projection.lulaPercent, null);
    assert.equal(projection.pendingValidVotes, null);
  }
});
test("API suspends projection when national fallback is stale despite all fresh UFs", async () => {
  resetElectionCache(); const now = Date.UTC(2026, 9, 25, 20); let failing = false;
  const fetcher = async url => {
    const code = /dados\/([a-z]+)\//.exec(url)[1].toUpperCase();
    if (failing && code === "BR") return new Response("", { status: 503 });
    const raw = fixture(code, { processed: 500, lula: 240, bolsonaro: 160 });
    if (code === "BR") { raw.e.te = "28000"; raw.e.est = "14000"; raw.e.esnt = "14000"; }
    return new Response(JSON.stringify(raw));
  };
  const first = await fetchElectionSnapshot({ fetcher, baseline, now });
  assert.equal(first.projection.available, true);
  failing = true;
  const next = await fetchElectionSnapshot({ fetcher, baseline, now: now + 56_000 });
  assert.equal(next.national.stale, true);
  assert.equal(next.projection.status, "limited");
  assert.equal(next.projection.available, false);
  assert.equal(next.projection.lulaPercent, null);
});
