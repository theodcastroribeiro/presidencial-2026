/** Official TSE EA20 adapter. Counts are never inferred from row order. */
import { projectReferences } from "./reference-projection.mjs";
export const ELECTION = Object.freeze({ id: "6258", year: 2026, round: 2, date: "2026-10-25", startsAt: "2026-10-25T17:00:00-03:00" });
export const CACHE_SECONDS = 55;
export const TECHNICAL_URL = "https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados";
export const REGIONS = Object.freeze([
  { code: "norte", name: "Norte", states: ["AC", "AP", "AM", "PA", "RO", "RR", "TO"] },
  { code: "nordeste", name: "Nordeste", states: ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"] },
  { code: "centro-oeste", name: "Centro-Oeste", states: ["DF", "GO", "MT", "MS"] },
  { code: "sudeste", name: "Sudeste", states: ["ES", "MG", "RJ", "SP"] },
  { code: "sul", name: "Sul", states: ["PR", "RS", "SC"] },
]);
const NAMES = { AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins", BR: "Brasil", ZZ: "Exterior" };
export const UF_CODES = Object.freeze(Object.keys(NAMES).filter(code => code !== "BR" && code !== "ZZ").sort());
export const SCOPES = Object.freeze(["BR", ...UF_CODES, "ZZ"]);
export const STATES = Object.freeze(UF_CODES.map(code => ({ code, name: NAMES[code], region: REGIONS.find(region => region.states.includes(code))?.code })));
export function sourceUrl(code = "BR") {
  if (!SCOPES.includes(code.toUpperCase())) throw new Error("Abrangência TSE desconhecida");
  const uf = code.toLowerCase();
  return `https://resultados.tse.jus.br/oficial/ele2026/6258/dados/${uf}/${uf}-c0001-e006258-u.json`;
}
export function numberFromTse(value) {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string" || !/^\d+(?:[,.]\d+)?$/.test(value.trim())) return null;
  const number = Number(value.trim().replace(",", "."));
  return Number.isFinite(number) && number >= 0 ? number : null;
}
function count(value, label, required = true) {
  const parsed = numberFromTse(value);
  if (parsed === null && !required) return null;
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Contagem inválida no TSE: ${label}`);
  return parsed;
}
function percent(part, total) { return total > 0 && part !== null ? part / total * 100 : null; }
function officialPercent(value, label) {
  const parsed = numberFromTse(value);
  if (parsed !== null && parsed > 100) throw new Error(`Percentual inválido no TSE: ${label}`);
  return parsed;
}
function clamp(value, min = 0, max = 1) { return Math.min(max, Math.max(min, value)); }
export function tseTimestamp(date, time) {
  if (typeof date !== "string" || typeof time !== "string") return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
  if (!match || !/^\d{2}:\d{2}:\d{2}$/.test(time)) return null;
  const calendar = new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
  const [hour, minute, second] = time.split(":").map(Number);
  if (calendar.getUTCFullYear() !== Number(match[3]) || calendar.getUTCMonth() + 1 !== Number(match[2]) || calendar.getUTCDate() !== Number(match[1]) || hour > 23 || minute > 59 || second > 59) return null;
  const result = `${match[3]}-${match[2]}-${match[1]}T${time}-03:00`;
  return Number.isFinite(Date.parse(result)) ? result : null;
}
export function normalizeTseResult(raw, requestedCode, fetchedAt = new Date().toISOString()) {
  const code = requestedCode?.toUpperCase();
  if (!SCOPES.includes(code)) throw new Error("Abrangência TSE desconhecida");
  if (!raw || String(raw.ele) !== ELECTION.id || String(raw.t) !== "2" || raw.f !== "o") throw new Error("Arquivo não corresponde ao segundo turno oficial de 2026");
  if (String(raw.cdabr).toUpperCase() !== code) throw new Error("Abrangência do arquivo TSE divergente");
  if (!Array.isArray(raw.carg)) throw new Error("Arquivo TSE sem cargo");
  const cargo = raw.carg.find(item => String(item.cd) === "1");
  if (!cargo) throw new Error("Arquivo TSE sem cargo Presidente");
  const candidates = [];
  for (const group of cargo.agr || []) for (const party of group.par || []) for (const candidate of party.cand || []) {
    candidates.push({ id: String(candidate.n) === "13" ? "lula" : String(candidate.n) === "22" ? "bolsonaro" : `candidate-${candidate.n}`, number: String(candidate.n), name: candidate.nmu || candidate.nm, fullName: candidate.nm || candidate.nmu, party: party.sg || "", votes: count(candidate.vap, "candidato.vap"), officialPercent: officialPercent(candidate.pvapn ?? candidate.pvap, "candidato.pvap"), status: candidate.st || "", elected: candidate.e === "s", destination: candidate.dvt || null });
  }
  const lula = candidates.find(item => item.number === "13");
  const bolsonaro = candidates.find(item => item.number === "22");
  if (!lula || !bolsonaro || candidates.length !== 2) throw new Error("Candidatos inesperados no segundo turno presidencial");
  if (!/LULA/i.test(lula.name || "") || !/FLAVIO|FLÁVIO/i.test(bolsonaro.name || "")) throw new Error("Identidade dos candidatos divergente da fonte oficial de 2026");
  const sections = count(raw.s?.ts, "s.ts");
  const sectionsProcessed = count(raw.s?.st, "s.st");
  const pendingSections = count(raw.s?.snt, "s.snt");
  const electorate = count(raw.e?.te, "e.te");
  const electorateProcessed = count(raw.e?.est, "e.est");
  const pendingElectorate = count(raw.e?.esnt, "e.esnt");
  const validVotes = count(raw.v?.vv, "v.vv");
  if (sectionsProcessed > sections || electorateProcessed > electorate || pendingElectorate > electorate) throw new Error("Contagem TSE fora dos totais da abrangência");
  if (sectionsProcessed + pendingSections !== sections) throw new Error("Seções totalizadas e pendentes não fecham com o total TSE");
  if (electorateProcessed + pendingElectorate !== electorate) throw new Error("Eleitorado totalizado e pendente não fecha com o total TSE");
  const warnings = [];
  if (lula.votes + bolsonaro.votes !== validVotes) warnings.push("Votos dos candidatos diferem dos votos válidos; projeção suspensa para esta abrangência.");
  const sourceUpdatedAt = tseTimestamp(raw.dg, raw.hg);
  if (!sourceUpdatedAt) throw new Error("Data de geração TSE ausente ou inválida");
  return {
    code, name: NAMES[code], region: REGIONS.find(region => region.states.includes(code))?.code || (code === "ZZ" ? "exterior" : "brasil"),
    electorate, electorateProcessed, pendingElectorate, electoratePercent: percent(electorateProcessed, electorate),
    sections, sectionsProcessed, pendingSections, sectionsPercent: officialPercent(raw.s?.pstn ?? raw.s?.pst, "s.pst") ?? percent(sectionsProcessed, sections),
    validVotes, lulaVotes: lula.votes, bolsonaroVotes: bolsonaro.votes,
    lulaPercent: validVotes > 0 ? lula.officialPercent ?? percent(lula.votes, validVotes) : null,
    bolsonaroPercent: validVotes > 0 ? bolsonaro.officialPercent ?? percent(bolsonaro.votes, validVotes) : null,
    totalVotes: count(raw.v?.tv, "v.tv", false), blankVotes: count(raw.v?.vb, "v.vb", false), nullVotes: count(raw.v?.tvn ?? raw.v?.vn, "v.tvn", false),
    attendance: count(raw.e?.c, "e.c", false), attendancePercent: sectionsProcessed ? officialPercent(raw.e?.pcn ?? raw.e?.pc, "e.pc") : null,
    abstentions: count(raw.e?.a, "e.a", false), abstentionPercent: sectionsProcessed ? officialPercent(raw.e?.pan ?? raw.e?.pa, "e.pa") : null,
    sourceUpdatedAt, totalizedAt: tseTimestamp(raw.dt, raw.ht), sourceFetchedAt: fetchedAt, sourceUrl: sourceUrl(code), generationId: String(raw.idg || ""),
    status: raw.tf === "s" || raw.and === "f" ? "finished" : sectionsProcessed > 0 ? "counting" : "waiting",
    final: raw.tf === "s", mathematicallyDefined: raw.md === "e", official: true, stale: false, candidates, warnings,
  };
}
const SUM_FIELDS = ["electorate", "electorateProcessed", "pendingElectorate", "sections", "sectionsProcessed", "pendingSections", "validVotes", "lulaVotes", "bolsonaroVotes", "totalVotes", "blankVotes", "nullVotes", "attendance", "abstentions"];
export function aggregateRegion(states, region) {
  const expectedCodes = region.states;
  const included = states.filter(state => expectedCodes.includes(state.code));
  const missing = expectedCodes.filter(code => !included.some(state => state.code === code));
  const staleCodes = included.filter(state => state.stale).map(state => state.code);
  const sums = Object.fromEntries(SUM_FIELDS.map(field => [field, included.length && included.every(state => typeof state[field] === "number") ? included.reduce((sum, state) => sum + state[field], 0) : null]));
  const latest = included.map(state => state.sourceUpdatedAt).filter(Boolean).sort().at(-1) || null;
  return { ...sums, code: region.code, name: region.name, region: region.code,
    sectionsPercent: percent(sums.sectionsProcessed, sums.sections), electoratePercent: percent(sums.electorateProcessed, sums.electorate),
    lulaPercent: percent(sums.lulaVotes, sums.validVotes), bolsonaroPercent: percent(sums.bolsonaroVotes, sums.validVotes),
    attendancePercent: percent(sums.attendance, sums.electorateProcessed), abstentionPercent: percent(sums.abstentions, sums.electorateProcessed),
    sourceUpdatedAt: latest, sourceFetchedAt: included.map(state => state.sourceFetchedAt).sort().at(-1) || null,
    sourceUrl: TECHNICAL_URL, status: included.length === expectedCodes.length && included.every(state => state.status === "finished") ? "finished" : sums.sectionsProcessed > 0 ? "counting" : "waiting",
    final: included.length === expectedCodes.length && included.every(state => state.final), mathematicallyDefined: false,
    official: false, aggregation: true, stale: staleCodes.length > 0,
    coverage: { available: included.length, expected: expectedCodes.length, complete: missing.length === 0 && staleCodes.length === 0, missing, stale: staleCodes },
    warnings: missing.length ? [`Dados indisponíveis: ${missing.join(", ")}. Totais regionais parciais.`] : [],
  };
}
/** Transparent scenario, not a probability or statistical confidence interval. */
export function projectElection(states, baseline = {}, options = {}) {
  const baselineMap = new Map((baseline.states || []).filter(item => Number.isSafeInteger(item.electorate) && item.electorate > 0 && Number.isSafeInteger(item.validVotes) && item.validVotes > 0 && item.validVotes <= item.electorate && Number.isSafeInteger(item.lulaVotes) && item.lulaVotes >= 0 && item.lulaVotes <= item.validVotes).map(item => [item.uf || item.code, item]));
  const expected = options.expectedStates || 28;
  const scenarioSwingPp = options.scenarioSwingPp ?? 3;
  const totalElectorate = options.totalElectorate || (states.length === expected ? states.reduce((sum, item) => sum + (item.electorate || 0), 0) : null);
  const usable = states.filter(state => !state.stale && state.official && !state.warnings?.length && state.electorate > 0 && (state.validVotes > 0 || baselineMap.has(state.code)));
  const excludedStates = states.filter(state => !usable.includes(state)).map(state => state.code);
  const observed = usable.filter(state => state.validVotes > 0);
  const base = { method: "Estratificação por UF", scenarioSwingPp, statesWithVotes: observed.length, statesIncluded: usable.length, statesExpected: expected, coveragePercent: totalElectorate ? usable.reduce((sum, item) => sum + item.electorate, 0) / totalElectorate * 100 : null, countedElectoratePercent: totalElectorate ? usable.reduce((sum, item) => sum + item.electorateProcessed, 0) / totalElectorate * 100 : null, excludedStates, baselineStates: 0,
    assumptions: ["Estimativa própria; o TSE publica votos apurados, não esta projeção.", "Votos pendentes são estimados por UF a partir do eleitorado ainda não totalizado, comparecimento e votos válidos observados; o rendimento de 2022 dá apoio no início.", "A ordem de chegada das urnas não é amostra aleatória. Diferenças dentro da UF podem deslocar o resultado.", `A faixa é um cenário de ±${scenarioSwingPp} pontos na participação de Lula apenas nos votos pendentes; não é intervalo de confiança nem probabilidade de vitória.`, "2026 compara Lula e Flávio Bolsonaro; o referencial de 2022 compara Lula e Jair Bolsonaro."] };
  const empty = { ...base, status: "waiting", available: false, lulaPercent: null, bolsonaroPercent: null, lulaVotes: null, bolsonaroVotes: null, validVotes: null, pendingValidVotes: null, lowLulaPercent: null, highLulaPercent: null, lowBolsonaroPercent: null, highBolsonaroPercent: null, states: [] };
  const incompleteCoverage = usable.length < expected || new Set(usable.map(state => state.code)).size < expected || excludedStates.length > 0 || base.coveragePercent === null || base.coveragePercent < 99.999;
  const nationalUnavailable = options.requireNational && !options.national;
  const nationalUnreliable = options.national?.stale || options.national?.warnings?.length;
  if (incompleteCoverage || nationalUnavailable || nationalUnreliable) return {
    ...empty, status: "limited",
    suspensionReason: nationalUnavailable ? "Total nacional oficial indisponível." : nationalUnreliable ? "Total nacional oficial preservado ou com divergências; projeção suspensa." : "A projeção nacional exige cobertura fresca de todas as UFs e do exterior.",
  };
  if (!observed.length) return empty;
  let lulaVotes = 0, bolsonaroVotes = 0, lowLulaVotes = 0, highLulaVotes = 0, pendingValidVotes = 0;
  const details = [];
  for (const state of usable) {
    const historical = baselineMap.get(state.code);
    const progress = state.electorateProcessed / state.electorate;
    const weight = clamp(progress / 0.1);
    const historicalYield = historical?.electorate > 0 ? historical.validVotes / historical.electorate : null;
    const observedYield = state.electorateProcessed > 0 ? clamp(state.validVotes / state.electorateProcessed) : null;
    const validYield = observedYield === null ? historicalYield : historicalYield === null ? observedYield : observedYield * weight + historicalYield * (1 - weight);
    if (validYield === null) { excludedStates.push(state.code); continue; }
    const remaining = Math.max(0, state.pendingElectorate * validYield);
    const historicalShare = historical?.validVotes > 0 ? historical.lulaVotes / historical.validVotes : null;
    const observedShare = state.validVotes > 0 ? state.lulaVotes / state.validVotes : null;
    const share = observedShare === null ? historicalShare : historicalShare === null ? observedShare : observedShare * weight + historicalShare * (1 - weight);
    if (share === null) { excludedStates.push(state.code); continue; }
    const projectedLula = state.lulaVotes + remaining * share;
    const projectedBolsonaro = state.bolsonaroVotes + remaining * (1 - share);
    lulaVotes += projectedLula; bolsonaroVotes += projectedBolsonaro;
    lowLulaVotes += state.lulaVotes + remaining * clamp(share - scenarioSwingPp / 100);
    highLulaVotes += state.lulaVotes + remaining * clamp(share + scenarioSwingPp / 100);
    pendingValidVotes += remaining;
    const basis = observedShare === null ? "baseline-2022" : weight < 1 && historicalShare !== null ? "blended" : "observed";
    if (basis !== "observed") base.baselineStates += 1;
    details.push({ code: state.code, remainingValidVotes: Math.round(remaining), lulaPercent: share * 100, bolsonaroPercent: (1 - share) * 100, basis });
  }
  const validVotes = lulaVotes + bolsonaroVotes;
  if (details.length < expected || excludedStates.length) return { ...empty, ...base, status: "limited", available: false, suspensionReason: "Faltam dados válidos para estimar todos os recortes; projeção nacional suspensa." };
  if (!validVotes) return empty;
  const allFinal = usable.length === expected && usable.every(state => state.status === "finished");
  const lowLulaPercent = lowLulaVotes / validVotes * 100;
  const highLulaPercent = highLulaVotes / validVotes * 100;
  return { ...base, status: allFinal ? "final" : details.length < expected || excludedStates.length ? "limited" : "available", available: true, lulaPercent: lulaVotes / validVotes * 100, bolsonaroPercent: bolsonaroVotes / validVotes * 100, lulaVotes: Math.round(lulaVotes), bolsonaroVotes: Math.round(bolsonaroVotes), validVotes: Math.round(validVotes), pendingValidVotes: Math.round(pendingValidVotes), lowLulaPercent, highLulaPercent, lowBolsonaroPercent: 100 - highLulaPercent, highBolsonaroPercent: 100 - lowLulaPercent, states: details };
}
const fileCache = new Map();
let snapshotCache = null;
let inFlight = null;
export function resetElectionCache() { fileCache.clear(); snapshotCache = null; inFlight = null; }
async function fetchScope(code, fetcher, now, timeoutMs) {
  const prior = fileCache.get(code);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(sourceUrl(code), { signal: controller.signal, headers: { Accept: "application/json", ...(prior?.etag ? { "If-None-Match": prior.etag } : {}) } });
    if (response.status === 304 && prior) {
      const result = { ...prior.result, stale: false, sourceFetchedAt: now };
      fileCache.set(code, { ...prior, result });
      return result;
    }
    if (!response.ok) throw new Error(`TSE respondeu HTTP ${response.status}`);
    const result = normalizeTseResult(await response.json(), code, now);
    fileCache.set(code, { result, etag: response.headers?.get("etag") || null });
    return result;
  } finally { clearTimeout(timeout); }
}
export async function fetchElectionSnapshot(options = {}) {
  const nowMs = options.now ?? Date.now();
  if (!options.force && snapshotCache && nowMs - snapshotCache.at < CACHE_SECONDS * 1000) return snapshotCache.value;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const fetchedAt = new Date(nowMs).toISOString();
    const results = new Map(); const errors = []; const codes = [...SCOPES];
    const fetcher = options.fetcher || fetch;
    async function runWorker() {
      while (codes.length) {
        const code = codes.shift();
        try { results.set(code, await fetchScope(code, fetcher, fetchedAt, options.timeoutMs || 9000)); }
        catch (error) {
          errors.push({ code, scope: code, message: error?.name === "AbortError" ? "Tempo de resposta do TSE excedido" : String(error?.message || "Falha ao ler TSE") });
          const previous = fileCache.get(code)?.result;
          if (previous) results.set(code, { ...previous, stale: true });
        }
      }
    }
    await Promise.all(Array.from({ length: 6 }, runWorker));
    const states = UF_CODES.map(code => results.get(code)).filter(Boolean);
    const overseas = results.get("ZZ") || null;
    const national = results.get("BR") || null;
    const regions = REGIONS.map(region => aggregateRegion(states, region));
    const projectionStates = [...states, ...(overseas ? [overseas] : [])];
    const projectionOptions = { totalElectorate: national?.electorate || undefined, national, requireNational: true };
    const legacyProjection = projectElection(projectionStates, options.baseline || {}, projectionOptions);
    const projections = options.references ? projectReferences(projectionStates, options.references, { ...projectionOptions, gateProjection: legacyProjection }) : null;
    const projection = projections?.combined || legacyProjection;
    const value = { fetchedAt, election: ELECTION, national, states, regions, overseas, errors, source: { name: "TSE", official: true, live: results.size > 0 && [...results.values()].some(result => !result.stale), partial: errors.length > 0, technicalUrl: TECHNICAL_URL, resultsUrl: "https://resultados.tse.jus.br/oficial/app/index.html#/eleicao/6258/uf/br/cargo/1/vis/nominal/resultados", cacheSeconds: CACHE_SECONDS }, projection, projections,
      coverage: { available: states.length + Number(Boolean(overseas)), expected: 28, fresh: [...states, ...(overseas ? [overseas] : [])].filter(state => !state.stale).length },
      stale: Boolean(national?.stale),
      consistency: national && states.length === 27 && overseas ? { nationalValidVotes: national.validVotes, stateValidVotes: [...states, overseas].reduce((sum, state) => sum + state.validVotes, 0), note: "Arquivos BR e UF são gerados e publicados separadamente; diferenças transitórias não alteram o total nacional oficial." } : null,
    };
    snapshotCache = { at: nowMs, value };
    return value;
  })();
  try { return await inFlight; } finally { inFlight = null; }
}
