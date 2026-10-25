/** Read-only recovery for the separate public Site. No mutation or secret output. */
export const SNAPSHOT_PREFIX = "presidential/2026/6258/2/snapshots/v1/";
const PRESERVED_NOTE = "Fonte temporariamente indisponível. Última leitura armazenada preservada; projeções suspensas.";
function withoutNumbers(value) {
  if (typeof value === "number") return null;
  if (Array.isArray(value)) return value.map(withoutNumbers);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withoutNumbers(item)]));
  return value;
}
function suspendProjection(value) {
  return value && typeof value === "object" ? {
    ...withoutNumbers(value), available: false, status: "limited", suspensionReason: PRESERVED_NOTE,
  } : null;
}
export function preserveSnapshot(snapshot) {
  if (!snapshot || snapshot.election?.id !== "6258" || snapshot.election?.year !== 2026
    || snapshot.election?.round !== 2 || snapshot.source?.official !== true || !snapshot.national) return null;
  const copy = structuredClone(snapshot);
  const stale = (scope) => scope ? { ...scope, stale: true, preserved: true } : null;
  return {
    ...copy, national: stale(copy.national), overseas: stale(copy.overseas),
    states: (copy.states || []).map(stale), regions: (copy.regions || []).map(stale),
    source: { ...copy.source, live: false, preserved: true, partial: true }, stale: true,
    projection: suspendProjection(copy.projection),
    projections: copy.projections ? Object.fromEntries(Object.entries(copy.projections).map(([key, value]) => [key, suspendProjection(value)])) : null,
    errors: [...(copy.errors || []), { scope: "BR", code: "preserved-snapshot", message: PRESERVED_NOTE }],
    historyPersistence: { stored: false, reason: "readonly-preserved-snapshot" }, preservedNotice: PRESERVED_NOTE,
  };
}
export async function readPreservedSnapshot(bucket) {
  if (!bucket) return null;
  try {
    // Reverse chronological keys. Skip a partial snapshot without BR if needed.
    const listing = await bucket.list({ prefix: SNAPSHOT_PREFIX, limit: 5 });
    for (const item of listing.objects) {
      const object = await bucket.get(item.key);
      if (!object) continue;
      const saved = await object.json();
      const preserved = preserveSnapshot(saved.snapshot);
      if (preserved) return preserved;
    }
  } catch { /* A failed read does not create replacement data. */ }
  return null;
}
/** Compare fixed-size hashes rather than returning early on a matching prefix. */
export async function bearerAuthorized(request, expected) {
  if (typeof expected !== "string" || !expected.length) return false;
  const match = /^Bearer ([^\s]+)$/i.exec(request.headers.get("authorization") || "");
  if (!match) return false;
  const encode = new TextEncoder();
  const hashes = await Promise.all([match[1], expected].map((value) => crypto.subtle.digest("SHA-256", encode.encode(value))));
  const actual = new Uint8Array(hashes[0]), wanted = new Uint8Array(hashes[1]);
  let difference = 0;
  for (let index = 0; index < wanted.length; index++) difference |= actual[index] ^ wanted[index];
  return difference === 0;
}
