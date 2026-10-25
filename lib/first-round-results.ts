import rawDataset from "../public/data/official-first-round-results.json";

export type OfficialFirstRoundCandidate = {
  number: string;
  id: string;
  /** Original ballot name (nmu), without editorial shortening. */
  name: string;
  /** Original full name (nm). */
  fullName: string;
  party: string;
  votes: number;
  /** Parsed published pvapn/pvap for direct sources; labeled UF aggregate for regions. */
  percent: number | null;
  publishedPercent: string | null;
  publishedPercentExact: string | null;
  /** Exact strings from the official file. Null for derived regional aggregates. */
  pvap: string | null;
  pvapn: string | null;
  destination: string;
  valid: boolean;
};
export type OfficialFirstRoundSource = { code: string; url: string; generatedAt: string | null };
export type OfficialFirstRoundResult = {
  code: string;
  name: string;
  kind: "national" | "state" | "overseas" | "region";
  electionId: string;
  year: number;
  round: 1;
  final: boolean;
  complete: boolean;
  official: boolean;
  aggregation: boolean;
  sections: number | null;
  sectionsProcessed: number | null;
  sectionsPercent: number | null;
  electorate: number | null;
  validVotes: number | null;
  votableVotes: number | null;
  denominator: "all-valid-candidates";
  denominatorLabel: string;
  percentSource: string;
  candidates: OfficialFirstRoundCandidate[];
  sourceUrl: string | null;
  sourceUpdatedAt: string | null;
  sourceFetchedAt: string;
  sourceLabel: string;
  sourceGenerationId?: string;
  sourceSha256?: string;
  sourceRange?: { earliest: string | null; latest: string | null };
  sources: OfficialFirstRoundSource[];
  coverage: { available: number; expected: number; missing: string[]; complete: boolean };
  warnings: string[];
};
export type OfficialFirstRoundDataset = {
  schemaVersion: number;
  election: { id: string; year: number; round: 1; date: string; office: string; officeCode: string; name: string; cycle: string; pleitoId: string };
  source: { kind: string; publisher: string; configUrl: string; configSha256: string; configGeneratedAt: string; importedAt: string; timezone: string; officialFiles: number; denominator: "all-valid-candidates"; ordering: string };
  scopes: Record<string, OfficialFirstRoundResult>;
  validation: Record<string, number | string | boolean>;
  notes: string[];
};

const dataset = rawDataset as unknown as OfficialFirstRoundDataset;
export const FIRST_ROUND_ELECTION = Object.freeze({ ...dataset.election });
export const FIRST_ROUND_SOURCE = Object.freeze({ ...dataset.source });

function nonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function publishedNumber(value: string | null): number | null {
  if (typeof value !== "string" || !/^\d+(?:[,.]\d+)?$/.test(value)) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

/** Guard against accidentally supplying a former two-candidate normalized snapshot. */
export function isAllCandidateFirstRoundResult(result: OfficialFirstRoundResult | null | undefined): result is OfficialFirstRoundResult {
  if (!result || result.round !== 1 || result.denominator !== "all-valid-candidates" || !Array.isArray(result.candidates) || result.candidates.length < 3) return false;
  if (!result.official && !result.aggregation) return false;
  const numbers = result.candidates.map(candidate => candidate.number);
  if (new Set(numbers).size !== numbers.length || numbers.some(number => !/^\d+$/.test(number))) return false;
  if (result.candidates.some((candidate, index) => !candidate.valid || !nonnegativeInteger(candidate.votes)
    || (index > 0 && Number(numbers[index - 1]) >= Number(candidate.number))
    || (candidate.percent !== null && (typeof candidate.percent !== "number" || !Number.isFinite(candidate.percent) || candidate.percent < 0 || candidate.percent > 100)))) return false;
  if (nonnegativeInteger(result.validVotes)) {
    if (result.candidates.reduce((sum, candidate) => sum + candidate.votes, 0) !== result.validVotes) return false;
    if (result.votableVotes !== result.validVotes) return false;
    if (result.validVotes > 0 && result.candidates.some(candidate => candidate.percent !== null && Math.abs(candidate.percent - candidate.votes / result.validVotes! * 100) > 0.00000001)) return false;
  } else if (result.complete || result.final) return false;
  if (result.official && result.candidates.some(candidate => {
    const exact = candidate.publishedPercentExact ?? candidate.publishedPercent;
    const value = publishedNumber(exact);
    return value === null || candidate.percent === null || Math.abs(value - candidate.percent) > 0.000000000001;
  })) return false;
  return true;
}

/** Returns only this audited all-candidate dataset, never the prior pair-normalized assets. */
export function getFirstRoundResult(code: string | null | undefined): OfficialFirstRoundResult | null {
  if (typeof code !== "string" || !code.trim()) return null;
  const requested = code.trim();
  const upper = requested.toUpperCase();
  const lower = requested.toLocaleLowerCase("pt-BR");
  const key = upper === "BRASIL" ? "BR" : upper === "EXTERIOR" ? "ZZ" : dataset.scopes[upper] ? upper : lower;
  const result = dataset.scopes[key];
  if (dataset.election.round !== 1 || dataset.election.officeCode !== "1" || dataset.source.denominator !== "all-valid-candidates" || result?.electionId !== dataset.election.id) return null;
  return isAllCandidateFirstRoundResult(result) ? result : null;
}

/** Fixed candidate identity lookup; it never orders by votes or computes a comparison. */
export function getFirstRoundCandidate(resultOrCode: OfficialFirstRoundResult | string | null | undefined, number: string | number): OfficialFirstRoundCandidate | null {
  const result = typeof resultOrCode === "string" ? getFirstRoundResult(resultOrCode) : resultOrCode;
  const candidateNumber = String(number);
  if (!isAllCandidateFirstRoundResult(result) || !/^\d+$/.test(candidateNumber)) return null;
  return result.candidates.find(candidate => candidate.number === String(Number(candidateNumber))) || null;
}

/** Direct published percent only. An absent published value stays absent. */
export function formatFirstRoundPublishedPercent(candidate: OfficialFirstRoundCandidate | null | undefined): string {
  const raw = candidate?.publishedPercentExact ?? candidate?.publishedPercent ?? null;
  return publishedNumber(raw) === null ? "—" : `${raw!.replace(".", ",")}%`;
}
