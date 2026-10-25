import test from "node:test";
import assert from "node:assert/strict";
import { projectFromReference, projectReferences, referencePointAt, combineReferenceProjections } from "../lib/reference-projection.mjs";
import { scenarioLimits } from "../lib/insights.mjs";
const state = (overrides = {}) => ({ code: "PA", electorate: 1000, electorateProcessed: 500, pendingElectorate: 500, validVotes: 500, lulaVotes: 100, bolsonaroVotes: 400, official: true, stale: false, warnings: [], ...overrides });
const baseline = { states: [{ uf: "PA", electorate: 1000, validVotes: 1000, lulaVotes: 600, bolsonaroVotes: 400 }] };
const history = { pointFields: ["at", "sectionsPercent", "electoratePercent", "lulaPercent", "bolsonaroPercent", "lulaVotes", "bolsonaroVotes", "electorateProcessed", "sections"], scopes: { PA: { points: [["2022-10-30T17:30:00-03:00", 50, 50, 20, 80, 100, 400, 500, 50]] } } };
const reference = { id: "historical2022", year: 2022, round: 2, baseline, history };
const options = { expectedStates: 1 };
test("historical residual corrects arrival-order bias instead of extrapolating early share", () => {
  const projection = projectFromReference([state()], reference, options);
  assert.equal(projection.available, true);
  assert.equal(projection.lulaPercent, 60);
  assert.equal(projection.lulaVotes, 600);
  assert.equal(projection.states[0].basis, "matched-residual");
  assert.equal(projection.states[0].residualLulaPercent, 100);
  assert.equal(projection.temporal.matchedStates, 1);
});
test("observed shift adjusts residual share without any fixed late gain", () => {
  const ref = { ...reference, baseline: { states: [{ uf: "PA", electorate: 1000, validVotes: 1000, lulaVotes: 500, bolsonaroVotes: 500 }] } };
  const projection = projectFromReference([state({ lulaVotes: 150, bolsonaroVotes: 350 })], ref, options);
  assert.equal(projection.states[0].shiftPp, 9.999999999999998);
  assert.ok(Math.abs(projection.states[0].residualLulaPercent - 90) < 1e-8);
  assert.ok(Math.abs(projection.lulaPercent - 60) < 1e-8);
});
test("large historical gap has explicit baseline fallback and no interpolated curve", () => {
  const projection = projectFromReference([state({ electorateProcessed: 800, pendingElectorate: 200, validVotes: 800, lulaVotes: 160, bolsonaroVotes: 640 })], reference, options);
  assert.equal(projection.temporal.matchedStates, 0);
  assert.equal(projection.temporal.gappedStates.length, 1);
  assert.equal(projection.states[0].basis, "baseline-gap");
  assert.equal(projection.states[0].lagPp, 30);
  assert.equal(projection.states[0].referenceProgressPercent, 50);
});
test("first round normalizes only the pair and discloses other voters explicitly", () => {
  const first = { id: "firstRound2026", year: 2026, round: 1, baseline: { states: [{ uf: "PA", electorate: 1000, validVotes: 800, lulaVotes: 300, bolsonaroVotes: 100, otherVotes: 400 }] }, history: null };
  const projection = projectFromReference([state({ electorateProcessed: 1, pendingElectorate: 999, validVotes: 1, lulaVotes: 1, bolsonaroVotes: 0 })], first, options);
  assert.equal(projection.states[0].referencePairLulaPercent, 75);
  assert.equal(projection.states[0].referenceAllValidLulaPercent, 37.5);
  assert.equal(projection.states[0].referenceOtherVotes, 400);
  assert.equal(projection.states[0].referenceValidYieldPercent, 80);
  assert.match(projection.otherVoteAssumption, /não têm transferência observada/);
  assert.match(projection.assumptions.join(" "), /Não foi encontrada série temporal/);
  assert.equal(projection.temporal.matchedStates, 0);
});
test("100% counted returns actual counts with no residual gain even without baseline", () => {
  const final = state({ electorateProcessed: 1000, pendingElectorate: 0, validVotes: 900, lulaVotes: 459, bolsonaroVotes: 441 });
  const projection = projectFromReference([final], { ...reference, baseline: { states: [] } }, options);
  assert.equal(projection.status, "final");
  assert.equal(projection.lulaVotes, 459);
  assert.equal(projection.lulaPercent, 51);
  assert.equal(projection.pendingValidVotes, 0);
  assert.equal(projection.lowLulaPercent, 51);
  assert.equal(projection.highLulaPercent, 51);
});
test("missing or stale UF suspends reference and combined national numbers", () => {
  const references = { historical2022: { baseline, history }, firstRound2026: { baseline } };
  for (const states of [[state()], [state({ stale: true })]]) {
    const projections = projectReferences(states, references, { expectedStates: 28, totalElectorate: 28000 });
    for (const projection of Object.values(projections)) {
      assert.equal(projection.available, false);
      assert.equal(projection.status, "limited");
      assert.equal(projection.lulaPercent, null);
      assert.equal(projection.lulaVotes, null);
    }
  }
});
test("reference lookup uses the previous real snapshot, never a future point", () => {
  assert.equal(referencePointAt(history, "PA", 0.49, baseline.states[0], 2), null);
  assert.equal(referencePointAt(history, "PA", 0.51, baseline.states[0], 2).progressPercent, 50);
  const corrected = structuredClone(history);
  corrected.scopes.PA.points.push(["2022-10-30T17:31:00-03:00", 50, 50, 21, 79, 105, 395, 500, 50]);
  assert.equal(referencePointAt(corrected, "PA", 0.51, baseline.states[0], 2).lulaVotes, 105);
});
test("combined uses declared equal weights on estimated vote counts", () => {
  const projections = projectReferences([state()], { historical2022: { baseline, history }, firstRound2026: { baseline, history: null } }, options);
  assert.equal(projections.historical2022.lulaPercent, 60);
  assert.equal(projections.firstRound2026.lulaPercent, 20);
  assert.equal(projections.combined.lulaPercent, 40);
  assert.deepEqual(projections.combined.referenceWeights, [{ id: "historical2022", weight: 0.5 }, { id: "firstRound2026", weight: 0.5 }]);
});
test("missing baseline reference never fabricates state estimates", () => {
  const projection = projectFromReference([state()], { ...reference, baseline: { states: [] } }, options);
  assert.equal(projection.available, false);
  assert.equal(projection.status, "limited");
  assert.equal(projection.lulaPercent, null);
});
test("combined slider has finite limits matching backend at 3pp", () => {
  const { combined } = projectReferences([state()], { historical2022: { baseline, history }, firstRound2026: { baseline, history: null } }, options);
  const limits = scenarioLimits(combined, 3);
  assert.ok(Number.isFinite(limits.low));
  assert.ok(Number.isFinite(limits.high));
  assert.ok(Math.abs(limits.low - combined.lowLulaPercent) < 1e-10);
  assert.ok(Math.abs(limits.high - combined.highLulaPercent) < 1e-10);
});
test("combined residual shares weight each reference by pending votes including 0/100", () => {
  const model = (id, remaining, share) => ({ id, available: true, status: "available", validVotes: 500 + remaining, pendingValidVotes: remaining, lulaVotes: 100 + remaining * share / 100, bolsonaroVotes: 400 + remaining * (1 - share / 100), states: [{ code: "PA", remainingValidVotes: remaining, lulaPercent: share }], temporal: {}, baselineStates: 0 });
  const combined = combineReferenceProjections([model("historical2022", 100, 0), model("firstRound2026", 300, 100)], [state()], options);
  assert.equal(combined.states[0].remainingValidVotes, 200);
  assert.equal(combined.states[0].lulaPercent, 75);
  const limits = scenarioLimits(combined, 3);
  assert.ok(Math.abs(limits.low - combined.lowLulaPercent) < 1e-10);
  assert.ok(Math.abs(limits.high - combined.highLulaPercent) < 1e-10);
  for (const edge of [0, 100]) {
    const atEdge = combineReferenceProjections([model("historical2022", 100, edge), model("firstRound2026", 300, edge)], [state()], options);
    const actual = scenarioLimits(atEdge, 3);
    assert.ok(Number.isFinite(actual.low) && Number.isFinite(actual.high));
    assert.ok(Math.abs(actual.low - atEdge.lowLulaPercent) < 1e-10);
    assert.ok(Math.abs(actual.high - atEdge.highLulaPercent) < 1e-10);
  }
});
test("first-round territory remains relevant beyond 10% instead of raw UF extrapolation", () => {
  const states = [state({ electorateProcessed: 500, pendingElectorate: 500, validVotes: 400, lulaVotes: 80, bolsonaroVotes: 320 }), state({ code: "AC", electorateProcessed: 200, pendingElectorate: 800, validVotes: 160, lulaVotes: 128, bolsonaroVotes: 32 })];
  const first = shares => ({ id: "firstRound2026", year: 2026, round: 1, baseline: { states: ["PA", "AC"].map((uf, index) => ({ uf, electorate: 1000, validVotes: 800, lulaVotes: Math.round(shares[index] * 800), bolsonaroVotes: Math.round((1 - shares[index]) * 800) })) }, history: null });
  const one = projectFromReference(states, first([0.6, 0.4]), { expectedStates: 2 });
  const two = projectFromReference(states, first([0.7, 0.3]), { expectedStates: 2 });
  assert.equal(one.available, true);
  assert.equal(two.available, true);
  assert.ok(Math.abs(one.lulaPercent - two.lulaPercent) > 1);
  assert.ok(Math.abs(one.states[0].lulaPercent - 20) > 1);
  assert.ok(Math.abs(one.states[1].lulaPercent - 80) > 1);
  assert.ok(one.states.every(value => value.basis === "territorial-shared-swing"));
  assert.ok(Number.isFinite(one.territorialSwingPp));
  const finished = states.map(value => ({ ...value, electorateProcessed: 1000, pendingElectorate: 0 }));
  const result = projectFromReference(finished, first([0.6, 0.4]), { expectedStates: 2 });
  assert.equal(result.status, "final");
  assert.equal(result.lulaVotes, 208);
  assert.equal(result.bolsonaroVotes, 352);
});
