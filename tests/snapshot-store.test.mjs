import assert from "node:assert/strict";
import test from "node:test";
import { recordSnapshot, readSnapshotHistory } from "../lib/snapshot-store.ts";

// Fictional, isolated adapter. No requests, credentials, or official writes.
class MemoryBucket {
  objects = new Map();
  pageSize = 77;
  failWrites = false;
  failLists = false;

  async put(key, value, options) {
    if (this.failWrites) throw new Error("Deliberate isolated test failure");
    assert.equal(options.onlyIf.etagDoesNotMatch, "*");
    if (this.objects.has(key)) return null;
    this.objects.set(key, { key, value, customMetadata: options.customMetadata });
    return { key };
  }

  async list({ prefix, cursor, limit, include }) {
    if (this.failLists) throw new Error("Deliberate isolated test failure");
    assert.deepEqual(include, ["customMetadata"]);
    const records = [...this.objects.values()]
      .filter((entry) => entry.key.startsWith(prefix))
      .sort((left, right) => left.key.localeCompare(right.key));
    const start = Number(cursor || 0);
    const end = Math.min(records.length, start + Math.min(limit, this.pageSize));
    return { objects: records.slice(start, end), truncated: end < records.length, cursor: String(end) };
  }
}

const codes = [
  "BR", "ZZ", "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
  "norte", "nordeste", "centro-oeste", "sudeste", "sul",
];

function snapshot(minute = 0) {
  const sourceUpdatedAt = new Date(Date.parse("2026-10-25T17:00:00-03:00") + minute * 60_000).toISOString();
  const scopes = codes.map((code, index) => ({
    code, official: code.length === 2, aggregation: code.length !== 2,
    sourceUpdatedAt, generationId: `fictional-generation-${minute}-${index}`, status: "counting",
    electorate: 157_345_678 - index * 3_179_211,
    electorateProcessed: 71_234_567 - index * 1_729_321,
    pendingElectorate: 86_111_111 - index * 1_449_890,
    sections: 571_234 - index * 11_345, sectionsProcessed: 284_345 - index * 5_001,
    sectionsPercent: 49.7791, validVotes: 61_234_567 - index * 1_734_321,
    lulaVotes: 32_345_678 - index * 912_111, bolsonaroVotes: 28_888_889 - index * 822_210,
    lulaPercent: 52.8225, bolsonaroPercent: 47.1775,
  }));
  return {
    fetchedAt: new Date(Date.parse(sourceUpdatedAt) + 10_000).toISOString(),
    election: { year: 2026, round: 2, id: "6258" },
    source: { name: "TSE", official: true, live: true },
    national: scopes[0], overseas: scopes[1], states: scopes.slice(2, 29), regions: scopes.slice(29), errors: [],
  };
}

test("concurrent identical generations produce one immutable nationwide object", async () => {
  const bucket = new MemoryBucket();
  const original = snapshot();
  const results = await Promise.all(Array.from({ length: 20 }, () => recordSnapshot(bucket, original)));
  assert.equal(results.filter((result) => result.stored).length, 1);
  assert.equal(bucket.objects.size, 1);
  const saved = JSON.parse(bucket.objects.values().next().value.value);
  assert.deepEqual(saved.snapshot, original);

  const recollected = structuredClone(original);
  recollected.fetchedAt = "2026-10-25T21:00:00Z";
  assert.equal((await recordSnapshot(bucket, recollected)).reason, "already-recorded");
  assert.equal(bucket.objects.size, 1);
  const history = await readSnapshotHistory(bucket);
  assert.equal(history.points.length, 1);
  assert.equal(history.collection.startedAt, original.fetchedAt);
  assert.equal(history.points[0].electorate, original.national.electorate);
  assert.equal(history.points[0].electorateProcessed, original.national.electorateProcessed);
});

test("a corrected vote count remains distinct even with the same official generation and timestamp", async () => {
  const bucket = new MemoryBucket();
  const original = snapshot();
  await recordSnapshot(bucket, original);
  const corrected = structuredClone(original);
  corrected.national.lulaVotes += 2;
  const correction = await recordSnapshot(bucket, corrected);
  assert.equal(correction.stored, true);
  assert.equal(bucket.objects.size, 2);
  const history = await readSnapshotHistory(bucket);
  assert.equal(history.points.length, 2);
  assert.deepEqual(history.points.map((point) => point.lulaVotes).sort((a, b) => a - b),
    [original.national.lulaVotes, corrected.national.lulaVotes]);
});

test("preserved, replay, demo, wrong election, and old sources cannot enter the live series", async () => {
  const bucket = new MemoryBucket();
  for (const mode of ["demo", "replay", "stale", "preserved"]) {
    const data = snapshot();
    data.mode = mode;
    assert.equal((await recordSnapshot(bucket, data)).reason, "not-current-official-snapshot");
  }
  const preserved = snapshot();
  preserved.source.preserved = true;
  assert.equal((await recordSnapshot(bucket, preserved)).reason, "not-current-official-snapshot");
  const notLive = snapshot();
  notLive.source.live = false;
  assert.equal((await recordSnapshot(bucket, notLive)).reason, "not-current-official-snapshot");
  const wrongElection = snapshot();
  wrongElection.election.id = "544";
  assert.equal((await recordSnapshot(bucket, wrongElection)).reason, "not-current-official-snapshot");
  const old = snapshot();
  old.national.sourceUpdatedAt = "2022-10-30T20:00:00Z";
  old.states = [];
  old.overseas = null;
  old.regions = [];
  assert.equal((await recordSnapshot(bucket, old)).reason, "no-official-source-generation");
  assert.equal(bucket.objects.size, 0);
});

test("fresh states survive partial collection while stale states and regions add no new points", async () => {
  const bucket = new MemoryBucket();
  await recordSnapshot(bucket, snapshot());
  const partial = snapshot(2);
  partial.source.partial = true;
  partial.states.find((scope) => scope.code === "PA").stale = true;
  partial.regions.find((scope) => scope.code === "norte").stale = true;
  assert.equal((await recordSnapshot(bucket, partial)).stored, true);
  assert.equal((await readSnapshotHistory(bucket, { scope: "PA" })).points.length, 1);
  assert.equal((await readSnapshotHistory(bucket, { scope: "norte" })).points.length, 1);
  assert.equal((await readSnapshotHistory(bucket, { scope: "SP" })).points.length, 2);
  const region = await readSnapshotHistory(bucket, { scope: "sul" });
  assert.equal(region.points.length, 2);
  assert.equal(region.points[0].official, false);
  assert.equal(region.points[0].aggregation, true);
});

test("unknown percentages do not become zero and unknown electorate remains null", async () => {
  const bucket = new MemoryBucket();
  const unknownPercent = snapshot();
  unknownPercent.national.lulaPercent = null;
  await recordSnapshot(bucket, unknownPercent);
  assert.equal((await readSnapshotHistory(bucket)).points.length, 0);
  const unknownElectorate = snapshot(1);
  unknownElectorate.national.electorate = null;
  unknownElectorate.national.electorateProcessed = null;
  await recordSnapshot(bucket, unknownElectorate);
  const history = await readSnapshotHistory(bucket);
  assert.equal(history.points.length, 1);
  assert.equal(history.points[0].electorate, null);
  assert.equal(history.points[0].electorateProcessed, null);
  assert.equal(history.points[0].lulaPercent, unknownElectorate.national.lulaPercent);
});

test("storage write failures preserve earlier immutable observations", async () => {
  const bucket = new MemoryBucket();
  await recordSnapshot(bucket, snapshot());
  const before = [...bucket.objects.entries()];
  bucket.failWrites = true;
  assert.equal((await recordSnapshot(bucket, snapshot(1))).reason, "storage-write-failed");
  assert.deepEqual([...bucket.objects.entries()], before);
  assert.equal((await readSnapshotHistory(bucket)).points.length, 1);
});

test("pagination and sampling retain real endpoints and at most 300 observed points", async () => {
  const bucket = new MemoryBucket();
  for (let minute = 0; minute < 655; minute++) await recordSnapshot(bucket, snapshot(minute));
  const history = await readSnapshotHistory(bucket, { limit: 300 });
  assert.equal(bucket.objects.size, 655);
  assert.equal(history.availablePoints, 655);
  assert.equal(history.points.length, 300);
  assert.equal(history.sampled, true);
  assert.equal(history.storage.partial, false);
  assert.equal(history.points[0].sourceUpdatedAt, snapshot(0).national.sourceUpdatedAt);
  assert.equal(history.points.at(-1).sourceUpdatedAt, snapshot(654).national.sourceUpdatedAt);
  const actualTimestamps = new Set(Array.from({ length: 655 }, (_, minute) => snapshot(minute).national.sourceUpdatedAt));
  assert.ok(history.points.every((point) => actualTimestamps.has(point.sourceUpdatedAt)));
});

test("34 scope metadata fits the conservative 7,500 byte cap and official R2 8 KiB limit", async () => {
  const bucket = new MemoryBucket();
  const result = await recordSnapshot(bucket, snapshot());
  assert.equal(result.stored, true);
  assert.ok(result.metadataBytes > 0);
  assert.ok(result.metadataBytes < 7_500);
  const entry = bucket.objects.values().next().value;
  const bytes = Object.entries(entry.customMetadata)
    .reduce((sum, [name, value]) => sum + Buffer.byteLength(name) + Buffer.byteLength(value), 0);
  assert.equal(bytes, result.metadataBytes);
  assert.ok(bytes < 8_192);
});

test("missing binding, unreadable record, and list failure are explicit without invented history", async () => {
  const missing = await readSnapshotHistory(undefined);
  assert.equal(missing.storage.available, false);
  assert.equal(missing.collection.startedAt, null);
  assert.deepEqual(missing.points, []);
  assert.equal((await recordSnapshot(undefined, snapshot())).reason, "storage-unavailable");

  const bucket = new MemoryBucket();
  await recordSnapshot(bucket, snapshot());
  await recordSnapshot(bucket, snapshot(1));
  bucket.objects.values().next().value.customMetadata.summary = "corrupt";
  const partial = await readSnapshotHistory(bucket);
  assert.equal(partial.storage.partial, true);
  assert.equal(partial.points.length, 1);
  assert.ok(partial.storage.errors.length > 0);
  bucket.failLists = true;
  const failed = await readSnapshotHistory(bucket);
  assert.equal(failed.storage.partial, true);
  assert.ok(failed.storage.errors.length > 0);
  assert.deepEqual(failed.points, []);
});
