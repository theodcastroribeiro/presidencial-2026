import test from "node:test";
import assert from "node:assert/strict";
import { buildCountProgress } from "../lib/count-progress.ts";

const MINUTE = 60_000;
const START = Date.parse("2026-10-25T17:00:00-03:00");
const iso = time => new Date(time).toISOString();
function fixture({ count = 13, interval = MINUTE, advance = 0.1, startPercent = 10, code = "BR", denominator = false } = {}) {
  const regional = code === "nordeste";
  const observations = Array.from({ length: count }, (_, index) => ({
    official: !regional, aggregation: regional,
    sourceUpdatedAt: iso(START + index * interval), recordedAt: iso(START + index * interval + 20_000),
    sectionsPercent: startPercent + index * advance,
    ...(denominator ? { sections: 100_000, sectionsProcessed: Math.round((startPercent + index * advance) * 1000) } : {}),
  }));
  const last = observations.at(-1);
  const scope = {
    code, name: code, official: !regional, aggregation: regional,
    sections: 100_000, sectionsProcessed: Math.round(last.sectionsPercent * 1000), sectionsPercent: last.sectionsPercent,
    sourceUpdatedAt: last.sourceUpdatedAt, sourceUrl: "https://resultados.tse.jus.br/fixture.json",
    stale: false, status: "counting", coverage: { complete: true, available: 1, expected: 1, missing: [] },
  };
  return { scope, observations, now: Date.parse(last.sourceUpdatedAt) + MINUTE, fetchedAt: iso(Date.parse(last.sourceUpdatedAt) + 30_000), historyReady: true, historyPartial: false };
}

test("linear official observations produce a bounded 30-minute scenario with quartile floor", () => {
  const input = fixture(), before = JSON.stringify(input), model = buildCountProgress(input);
  assert.equal(model.status, "ready");
  assert.equal(model.forecast.length, 31);
  assert.ok(Math.abs(model.rate.median - 0.1) < 1e-10);
  assert.ok(Math.abs(model.forecast.at(-1).percent - 14.2) < 1e-10);
  assert.ok(model.rate.low < model.rate.median && model.rate.high > model.rate.median);
  assert.equal(model.clock, "source");
  assert.equal(model.observed.length, input.observations.length);
  assert.equal(JSON.stringify(input), before, "the pure model must not mutate snapshots");
});

test("minimum six points must span ten minutes", () => {
  assert.equal(buildCountProgress(fixture({ count: 5, interval: 3 * MINUTE })).reasonCode, "insufficient-points");
  assert.equal(buildCountProgress(fixture({ count: 6 })).reasonCode, "insufficient-span");
  assert.equal(buildCountProgress(fixture({ count: 6, interval: 2 * MINUTE })).status, "ready");
});

test("a gap over three minutes is neither linked nor used across the fit", () => {
  const input = fixture();
  for (let index = 10; index < input.observations.length; index++) {
    input.observations[index].sourceUpdatedAt = iso(START + (index + 8) * MINUTE);
    input.observations[index].recordedAt = input.observations[index].sourceUpdatedAt;
  }
  input.scope.sourceUpdatedAt = input.observations.at(-1).sourceUpdatedAt;
  input.fetchedAt = input.scope.sourceUpdatedAt; input.now = Date.parse(input.fetchedAt);
  const model = buildCountProgress(input);
  assert.equal(model.observed[10].reset, "gap"); assert.equal(model.observed[10].breakBefore, true);
  assert.equal(model.available, false); assert.equal(model.reasonCode, "insufficient-points");
});

test("regression is preserved and restarts the fit, without making progress monotone", () => {
  const input = fixture(); input.scope.sectionsPercent = 4; input.scope.sectionsProcessed = 4000;
  const model = buildCountProgress(input);
  assert.equal(model.observed.at(-1).percent, 4);
  assert.equal(model.observed.at(-1).reset, "regression"); assert.equal(model.available, false);
});

test("a known denominator change resets the fit but an absent legacy field does not", () => {
  const known = fixture({ denominator: true }); known.scope.sections *= 2;
  const changed = buildCountProgress(known);
  assert.equal(changed.observed.at(-1).reset, "denominator"); assert.equal(changed.available, false);
  const legacy = buildCountProgress(fixture());
  assert.equal(legacy.status, "ready"); assert.equal(legacy.hasLegacyDenominator, true);
  assert.match(legacy.method, /legados.*denominador/);
});

test("regional timestamps use collection time even when component source times repeat", () => {
  const input = fixture({ code: "nordeste" });
  for (const point of input.observations) point.sourceUpdatedAt = input.scope.sourceUpdatedAt;
  const model = buildCountProgress(input);
  assert.equal(model.status, "ready"); assert.equal(model.clock, "recorded");
  assert.equal(model.observed[0].time, Date.parse(input.observations[0].recordedAt));
  assert.ok(model.observed.length >= 13); assert.match(model.note, /não uma geração simultânea/);
});

test("source older than five minutes, stale scope and old fetch suspend while observations remain", () => {
  for (const alter of [input => { input.now += 6 * MINUTE; }, input => { input.scope.stale = true; }, input => { input.fetchedAt = iso(START); }]) {
    const input = fixture(); alter(input); const model = buildCountProgress(input);
    assert.equal(model.reasonCode, "stale-source"); assert.equal(model.forecast.length, 0); assert.ok(model.observed.length > 0);
  }
});

test("incomplete coverage or partial history suspends; wrong-scope history is never displayed", () => {
  const incomplete = fixture(); incomplete.scope.coverage.complete = false;
  assert.equal(buildCountProgress(incomplete).reasonCode, "incomplete-coverage");
  const partial = fixture(); partial.historyPartial = true;
  assert.equal(buildCountProgress(partial).reasonCode, "partial-history");
  const loading = fixture(); loading.historyReady = false;
  const model = buildCountProgress(loading);
  assert.equal(model.reasonCode, "history-not-ready"); assert.equal(model.observed.length, 1); assert.equal(model.observed[0].origin, "current");
});

test("unknown or invalid current percentage suspends without converting it to zero", () => {
  for (const value of [null, NaN, -1, 101]) {
    const input = fixture(); input.scope.sectionsPercent = value;
    const model = buildCountProgress(input);
    assert.equal(model.reasonCode, "invalid-current"); assert.equal(model.available, false); assert.ok(model.observed.length > 0);
  }
});

test("preserved historical points remain visible but do not supply fit windows", () => {
  const input = fixture(); input.observations.forEach(point => { point.stale = true; });
  const model = buildCountProgress(input);
  assert.equal(model.available, false); assert.equal(model.reasonCode, "insufficient-points");
  assert.ok(model.observed.some(point => !point.eligibleForFit));
});

test("a flat observed pace keeps a zero central advance; floor only widens scenarios", () => {
  const model = buildCountProgress(fixture({ advance: 0, startPercent: 0 }));
  assert.equal(model.status, "ready"); assert.equal(model.rate.median, 0);
  assert.equal(model.forecast.at(-1).percent, 0); assert.equal(model.forecast.at(-1).low, 0);
  assert.ok(model.forecast.at(-1).high > 0); assert.equal(model.observed[0].percent, 0);
});

test("clamping has no promise of completion and confirmed final regional data is labeled aggregate", () => {
  const nearEnd = buildCountProgress(fixture({ startPercent: 90, advance: 0.7 }));
  assert.equal(nearEnd.status, "ready"); assert.equal(nearEnd.forecast.at(-1).percent, 100);
  assert.ok(nearEnd.forecast.every(point => point.low >= 0 && point.high <= 100 && point.low <= point.percent && point.percent <= point.high));
  assert.match(nearEnd.summary, /teto visual de 100%.*horário de conclusão não estimado/);
  assert.doesNotMatch(nearEnd.summary, /faixa de ritmo/);
  const final = fixture({ code: "nordeste", advance: 0, startPercent: 100 }); final.scope.status = "finished";
  const model = buildCountProgress(final);
  assert.equal(model.status, "finished"); assert.equal(model.forecast.length, 0);
  assert.match(model.summary, /Agregado regional/); assert.doesNotMatch(model.summary, /TSE informa/);
});

test("the displayed official source timestamp belongs to the actual latest historical anchor", () => {
  const input = fixture();
  input.scope.sourceUpdatedAt = input.observations.at(-2).sourceUpdatedAt;
  input.scope.sectionsPercent = input.observations.at(-2).sectionsPercent;
  input.fetchedAt = iso(Date.parse(input.scope.sourceUpdatedAt) + 10_000);
  const model = buildCountProgress(input);
  assert.equal(model.status, "ready");
  assert.equal(model.sourceAt, input.observations.at(-1).sourceUpdatedAt);
});

test("repeated official times are revisions rather than extra sampled instants", () => {
  const input = fixture(); input.observations.push({ ...input.observations.at(-1), recordedAt: input.fetchedAt });
  const model = buildCountProgress(input);
  assert.equal(model.observed.length, 13);
});

test("null clock and entirely absent observations do not fabricate points or scenarios", () => {
  const input = fixture(); input.now = null;
  assert.equal(buildCountProgress(input).reasonCode, "clock-unavailable");
  const empty = buildCountProgress({ ...input, scope: null, observations: [] });
  assert.equal(empty.observed.length, 0); assert.equal(empty.forecast.length, 0); assert.equal(empty.domain, null);
});
