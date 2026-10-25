/** Immutable official snapshots. The caller supplies the R2 binding explicitly. */
const PREFIX = "presidential/2026/6258/2/snapshots/v1/";
const COLLECTION_DATE = "2026-10-25";
const FIRST_SOURCE_TIME = Date.parse(`${COLLECTION_DATE}T00:00:00-03:00`);
const MAX_METADATA_BYTES = 7_500;
const MAX_SCAN_OBJECTS = 5_000;
const MAX_POINTS = 300;
const encoder = new TextEncoder();

export type SnapshotBucket = Pick<R2Bucket, "put" | "list">;

export interface HistoryPoint {
  official: boolean;
  aggregation: boolean;
  recordedAt: string;
  sourceUpdatedAt: string;
  generationId: string;
  sectionsPercent: number;
  validVotes: number;
  lulaVotes: number;
  bolsonaroVotes: number;
  lulaPercent: number;
  bolsonaroPercent: number;
  electorate: number | null;
  electorateProcessed: number | null;
  pendingElectorate: number | null;
}

export interface SnapshotHistory {
  scope: string;
  points: HistoryPoint[];
  availablePoints: number;
  sampled: boolean;
  collection: {
    mode: "while-open";
    pollSeconds: 60;
    date: "2026-10-25";
    startedAt: string | null;
    firstRecordedAt: string | null;
    lastRecordedAt: string | null;
    gaps: { from: string; to: string; minutes: number }[];
    note: string;
  };
  storage: { available: boolean; partial: boolean; errors: string[] };
}

type ObjectLike = Record<string, unknown>;
// Versioned wire order keeps metadata small while preserving every exact count.
type WirePoint = [string, string, string, number, number, number, number, number, number, number | null, number | null, number | null, 0 | 1];
type WireSummary = { v: 1; at: string; rows: WirePoint[] };

function object(value: unknown): value is ObjectLike {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function percent(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}

function scopeCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,23}$/.test(value);
}

function nullableInteger(value: unknown): number | null {
  return integer(value) ? value : null;
}

function officialScopes(data: ObjectLike): ObjectLike[] {
  const list = [data.national, data.overseas,
    ...(Array.isArray(data.states) ? data.states : []),
    ...(Array.isArray(data.regions) ? data.regions : [])];
  return list.filter((scope): scope is ObjectLike => object(scope)
    && (scope.official === true || (scope.aggregation === true
      && ["norte", "nordeste", "centro-oeste", "sudeste", "sul"].includes(String(scope.code))))
    && scope.stale !== true && scope.preserved !== true && scopeCode(scope.code)
    && timestamp(scope.sourceUpdatedAt)
    && Date.parse(scope.sourceUpdatedAt) >= FIRST_SOURCE_TIME
    && !["demo", "replay", "preserved", "stale"].includes(String(scope.mode ?? "")));
}

function wirePoint(scope: ObjectLike): WirePoint | null {
  if (!scopeCode(scope.code) || !timestamp(scope.sourceUpdatedAt)
    || !percent(scope.sectionsPercent) || !integer(scope.validVotes) || scope.validVotes === 0
    || !integer(scope.lulaVotes) || !integer(scope.bolsonaroVotes)
    || !percent(scope.lulaPercent) || !percent(scope.bolsonaroPercent)) return null;
  return [scope.code, scope.sourceUpdatedAt, String(scope.generationId ?? ""),
    scope.sectionsPercent, scope.validVotes, scope.lulaVotes, scope.bolsonaroVotes,
    scope.lulaPercent, scope.bolsonaroPercent, nullableInteger(scope.electorate),
    nullableInteger(scope.electorateProcessed), nullableInteger(scope.pendingElectorate), scope.official === true ? 1 : 0];
}

async function gzipBase64(value: string): Promise<string> {
  const stream = new Blob([value]).stream().pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function gunzipBase64(value: string): Promise<string> {
  const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

function validWire(value: unknown): value is WirePoint {
  return Array.isArray(value) && value.length === 13 && scopeCode(value[0]) && timestamp(value[1])
    && typeof value[2] === "string" && percent(value[3]) && integer(value[4]) && value[4] > 0
    && integer(value[5]) && integer(value[6]) && percent(value[7]) && percent(value[8])
    && value.slice(9, 12).every((count) => count === null || integer(count)) && (value[12] === 0 || value[12] === 1);
}

function unpack(row: WirePoint, recordedAt: string): HistoryPoint {
  return { official: row[12] === 1, aggregation: row[12] === 0, recordedAt, sourceUpdatedAt: row[1], generationId: row[2], sectionsPercent: row[3],
    validVotes: row[4], lulaVotes: row[5], bolsonaroVotes: row[6], lulaPercent: row[7],
    bolsonaroPercent: row[8], electorate: row[9], electorateProcessed: row[10], pendingElectorate: row[11] };
}

/**
 * One conditional put atomically stores the full nationwide snapshot and its
 * compressed summary. No mutable latest pointer or read/modify/write index.
 * Failures never delete previously stored objects and never relabel source data.
 */
export async function recordSnapshot(bucket: SnapshotBucket | undefined, data: unknown): Promise<{
  stored: boolean; key?: string; metadataBytes?: number; reason?: string;
}> {
  if (!bucket) return { stored: false, reason: "storage-unavailable" };
  if (!object(data) || !object(data.election) || data.election.id !== "6258"
    || data.election.year !== 2026 || data.election.round !== 2
    || !object(data.source) || data.source.name !== "TSE" || data.source.official !== true
    || data.source.live === false || data.source.preserved === true
    || ["demo", "replay", "preserved", "stale"].includes(String(data.mode ?? data.source.mode ?? ""))
    || !timestamp(data.fetchedAt) || Date.parse(data.fetchedAt) < FIRST_SOURCE_TIME) {
    return { stored: false, reason: "not-current-official-snapshot" };
  }
  const scopes = officialScopes(data).sort((left, right) => String(left.code).localeCompare(String(right.code)));
  if (!scopes.length) return { stored: false, reason: "no-official-source-generation" };

  // Include exact values too: a correction with the same source timestamp must
  // remain a distinct immutable observation. Local fetch time is not identity.
  const identity = scopes.map((scope) => [scope.code, scope.sourceUpdatedAt, scope.generationId,
    scope.sections, scope.sectionsProcessed, scope.sectionsPercent, scope.validVotes,
    scope.lulaVotes, scope.bolsonaroVotes, scope.lulaPercent, scope.bolsonaroPercent,
    scope.electorate, scope.electorateProcessed, scope.pendingElectorate, scope.status, scope.official, scope.aggregation]);
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(JSON.stringify(identity)));
  const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const officialTime = Math.max(...scopes.map((scope) => Date.parse(scope.sourceUpdatedAt as string)));
  // Reverse chronological keys ensure a bounded scan always includes the latest.
  const reverseTime = String(9_999_999_999_999 - officialTime).padStart(13, "0");
  const key = `${PREFIX}${reverseTime}-${fingerprint}.json`;
  const rows = scopes.map(wirePoint).filter((row): row is WirePoint => row !== null);
  const summary: WireSummary = { v: 1, at: data.fetchedAt, rows };

  try {
    const compressed = await gzipBase64(JSON.stringify(summary));
    const customMetadata = { format: "history-v1-gzip-base64", summary: compressed };
    const metadataBytes = Object.entries(customMetadata)
      .reduce((sum, [name, value]) => sum + encoder.encode(name).length + encoder.encode(value).length, 0);
    if (metadataBytes > MAX_METADATA_BYTES) return { stored: false, reason: "metadata-size-limit", metadataBytes };
    const stored = await bucket.put(key, JSON.stringify({ version: 1, fingerprint, recordedAt: data.fetchedAt, snapshot: data }), {
      onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: "application/json", cacheControl: "private, immutable" },
      customMetadata,
    });
    return { stored: stored !== null, key, metadataBytes, ...(stored ? {} : { reason: "already-recorded" }) };
  } catch {
    return { stored: false, reason: "storage-write-failed" };
  }
}

function evenSample<T>(values: T[], limit: number): T[] {
  if (values.length <= limit) return values;
  return Array.from({ length: limit }, (_, index) => values[Math.round(index * (values.length - 1) / (limit - 1))]);
}

export async function readSnapshotHistory(bucket: SnapshotBucket | undefined, options: {
  scope?: string; limit?: number;
} = {}): Promise<SnapshotHistory> {
  const requestedScope = options.scope ?? "BR";
  const scope = requestedScope.length === 2 ? requestedScope.toUpperCase() : requestedScope.toLowerCase();
  if (!scopeCode(scope)) throw new Error("Invalid history scope");
  const limit = Math.max(2, Math.min(MAX_POINTS, Math.floor(options.limit ?? MAX_POINTS) || MAX_POINTS));
  const response: SnapshotHistory = {
    scope, points: [], availablePoints: 0, sampled: false,
    collection: { mode: "while-open", pollSeconds: 60, date: COLLECTION_DATE, startedAt: null,
      firstRecordedAt: null, lastRecordedAt: null, gaps: [],
      note: "Coleta a cada 60 segundos enquanto o painel está aberto. Sem visitantes, não há coleta garantida. Lacunas não são preenchidas." },
    storage: { available: Boolean(bucket), partial: false, errors: [] },
  };
  if (!bucket) {
    response.storage.errors.push("Armazenamento histórico indisponível nesta execução.");
    return response;
  }

  const observations = new Map<string, HistoryPoint>();
  const snapshotTimes = new Set<string>();
  let scanned = 0;
  let cursor: string | undefined;
  try {
    do {
      // R2 supports include; the bundled workers types omit it in this version.
      const listOptions: R2ListOptions & { include: string[] } = {
        prefix: PREFIX, limit: Math.min(500, MAX_SCAN_OBJECTS - scanned), cursor, include: ["customMetadata"],
      };
      const page = await bucket.list(listOptions);
      scanned += page.objects.length;
      for (const entry of page.objects) {
        try {
          if (entry.customMetadata?.format !== "history-v1-gzip-base64" || !entry.customMetadata.summary) throw new Error();
          const raw: unknown = JSON.parse(await gunzipBase64(entry.customMetadata.summary));
          if (!object(raw) || raw.v !== 1 || !timestamp(raw.at) || !Array.isArray(raw.rows)) throw new Error();
          snapshotTimes.add(raw.at);
          for (const row of raw.rows) {
            if (!validWire(row) || row[0] !== scope || Date.parse(row[1]) < FIRST_SOURCE_TIME) continue;
            const point = unpack(row, raw.at);
            // A state unchanged while another state changes is one observation.
            // Same-time corrections remain separate when their exact values differ.
            const identity = JSON.stringify(row);
            const previous = observations.get(identity);
            if (!previous || Date.parse(point.recordedAt) < Date.parse(previous.recordedAt)) observations.set(identity, point);
          }
        } catch {
          response.storage.partial = true;
          if (!response.storage.errors.length) response.storage.errors.push("Um registro histórico não pôde ser lido; os demais foram preservados.");
        }
      }
      cursor = page.truncated ? page.cursor : undefined;
      if (cursor && scanned >= MAX_SCAN_OBJECTS) {
        response.storage.partial = true;
        response.storage.errors.push("Histórico limitado aos 5.000 snapshots oficiais mais recentes.");
        break;
      }
    } while (cursor);
  } catch {
    response.storage.partial = true;
    response.storage.errors.push("Falha ao consultar parte do histórico; os pontos já lidos foram preservados.");
  }

  const points = Array.from(observations.values()).sort((left, right) =>
    Date.parse(left.sourceUpdatedAt) - Date.parse(right.sourceUpdatedAt)
    || Date.parse(left.recordedAt) - Date.parse(right.recordedAt));
  response.availablePoints = points.length;
  response.sampled = points.length > limit;
  response.points = evenSample(points, limit);
  const recordedTimes = Array.from(snapshotTimes).sort((left, right) => Date.parse(left) - Date.parse(right));
  response.collection.startedAt = recordedTimes[0] ?? null;
  response.collection.firstRecordedAt = recordedTimes[0] ?? null;
  response.collection.lastRecordedAt = recordedTimes.at(-1) ?? null;
  for (let index = 1; index < recordedTimes.length; index++) {
    const minutes = (Date.parse(recordedTimes[index]) - Date.parse(recordedTimes[index - 1])) / 60_000;
    if (minutes > 3) response.collection.gaps.push({ from: recordedTimes[index - 1], to: recordedTimes[index], minutes: Math.round(minutes * 10) / 10 });
  }
  return response;
}
